import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { AppDataSource } from "../config/data-source";
import { Activity, Call, CallDirection, CallOutcome, Lead, Notification, NotificationPriority, NotificationType, User, UserRole } from "../entities";
import { applyCallCompletion } from "./call-log.service";
import { findLeadsByPhone } from "./phone-match.service";
import {
  CallSnapshot,
  TataWebhookPayload,
  extractCustomerNumber,
  isTerminalEvent,
  mergeWebhookEvent,
} from "./tata-webhook";
import { toE164 } from "../utils/phone";

const SMARTFLO_API_KEY = () => process.env.TATA_SMARTFLO_API_KEY || "";
const SMARTFLO_BASE_URL = () => process.env.TATA_SMARTFLO_BASE_URL || "https://api.smartflo.tatatelebusiness.com";
const WEBHOOK_SECRET = () => process.env.TATA_SMARTFLO_WEBHOOK_SECRET || "";
const CALLER_ID = () => process.env.TATA_SMARTFLO_CALLER_ID || "";
const MOCK_MODE = () => process.env.TATA_SMARTFLO_MOCK === "true";

export function verifyTataWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  const secret = WEBHOOK_SECRET();
  if (!secret) return true; // not configured — allow (local/dev)
  if (!signature) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.startsWith("sha256=") ? signature : `sha256=${signature}`;
  try {
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function signTataPayload(rawBody: string | Buffer, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

async function findAgentByExtension(extension: string | null | undefined): Promise<User | null> {
  if (!extension) return null;
  return AppDataSource.getRepository(User).findOne({ where: { tata_extension: extension } });
}

async function resolveLeadForCall(snapshot: CallSnapshot, existingLeadId: string | null): Promise<{
  lead: Lead | null;
  ambiguous: boolean;
  unmatched: boolean;
  allNames: string[];
}> {
  if (existingLeadId) {
    const lead = await AppDataSource.getRepository(Lead).findOne({ where: { id: existingLeadId } });
    if (lead) return { lead, ambiguous: false, unmatched: false, allNames: [lead.name] };
  }

  if (snapshot.lead_id) {
    const byRef = await AppDataSource.getRepository(Lead).findOne({ where: { id: snapshot.lead_id } });
    if (byRef) return { lead: byRef, ambiguous: false, unmatched: false, allNames: [byRef.name] };
  }

  const match = await findLeadsByPhone(snapshot.customer_phone);
  if (match.unmatched || !match.lead) {
    return { lead: null, ambiguous: false, unmatched: true, allNames: [] };
  }

  const lead = await AppDataSource.getRepository(Lead).findOne({ where: { id: match.lead.id } });
  return {
    lead,
    ambiguous: match.ambiguous,
    unmatched: false,
    allNames: match.all.map((l) => l.name),
  };
}

async function notifyUnmatchedCall(snapshot: CallSnapshot): Promise<void> {
  const userRepository = AppDataSource.getRepository(User);
  const notificationRepository = AppDataSource.getRepository(Notification);

  const admins = await userRepository.find({
    where: [
      { role: UserRole.ADMIN, is_active: true },
      { role: UserRole.MANAGER, is_active: true },
    ],
  });

  const phone = snapshot.customer_phone || "unknown";
  for (const admin of admins) {
    const notification = notificationRepository.create({
      id: uuidv4(),
      user_id: admin.id,
      type: NotificationType.UNMATCHED_CALL,
      priority: NotificationPriority.HIGH,
      title: "Unmatched call recording",
      message: `A Tata call (${snapshot.tata_call_id}) from ${phone} could not be matched to a lead. The recording was kept and is not assigned.`,
      target_type: "call",
      metadata: {
        tata_call_id: snapshot.tata_call_id,
        customer_phone: phone,
        recording_url: snapshot.recording_url,
        direction: snapshot.direction,
      },
    });
    await notificationRepository.save(notification);
  }
}

async function logAmbiguousMatch(lead: Lead, snapshot: CallSnapshot, allNames: string[]): Promise<void> {
  const activityRepository = AppDataSource.getRepository(Activity);
  const activity = activityRepository.create({
    id: uuidv4(),
    user_id: null,
    user_name: "Tata Smartflo",
    action: "call_matched_ambiguous",
    target_id: lead.id,
    target_type: "lead",
    target_name: lead.name,
    details: `Call ${snapshot.tata_call_id} matched this lead among ${allNames.length} leads sharing the same number (${allNames.join(", ")}). Attached to the most recently active lead.`,
  });
  await activityRepository.save(activity);
}

function applySnapshotToCall(call: Call, snapshot: CallSnapshot): void {
  call.tata_call_id = snapshot.tata_call_id;
  if (snapshot.direction) call.direction = snapshot.direction as CallDirection;
  if (snapshot.outcome) call.outcome = snapshot.outcome;
  if (snapshot.recording_url) call.recording_url = snapshot.recording_url;
  if (snapshot.started_at) call.started_at = snapshot.started_at;
  if (snapshot.answered_at) call.answered_at = snapshot.answered_at;
  if (snapshot.ended_at) call.ended_at = snapshot.ended_at;
  if (snapshot.duration_minutes) call.duration_minutes = snapshot.duration_minutes;
  if (snapshot.customer_phone) call.customer_phone = snapshot.customer_phone;
}

/**
 * Upsert a calls row by tata_call_id. Never silently drops an unmatched recording.
 */
export async function upsertTataWebhookEvent(payload: TataWebhookPayload): Promise<Call> {
  const data = payload.data || {};
  const callId = data.call_id;
  if (!callId) {
    throw new Error("Webhook missing data.call_id");
  }

  const callRepository = AppDataSource.getRepository(Call);
  let call = await callRepository.findOne({ where: { tata_call_id: callId } });

  const existingSnapshot: CallSnapshot | null = call
    ? {
        tata_call_id: call.tata_call_id!,
        direction: call.direction,
        outcome: call.outcome,
        recording_url: call.recording_url,
        started_at: call.started_at,
        answered_at: call.answered_at,
        ended_at: call.ended_at,
        duration_minutes: call.duration_minutes,
        lead_id: call.lead_id,
        customer_phone: call.customer_phone,
        agent_number: null,
      }
    : null;

  const hadTerminalOutcome = !!existingSnapshot?.outcome;
  const snapshot = mergeWebhookEvent(existingSnapshot, payload);

  if (!snapshot.customer_phone && data) {
    snapshot.customer_phone = extractCustomerNumber(data, snapshot.direction) || snapshot.customer_phone;
  }

  const agent = await findAgentByExtension(data.agent_number);
  const resolution = await resolveLeadForCall(snapshot, call?.lead_id || null);

  if (!call) {
    call = callRepository.create({
      id: uuidv4(),
      tata_call_id: callId,
      lead_id: resolution.lead?.id || null,
      user_id: agent?.id || null,
      user_name: agent?.name || "Tata Smartflo",
      outcome: snapshot.outcome,
      duration_minutes: snapshot.duration_minutes || 0,
      notes: resolution.unmatched
        ? `Unmatched number: ${snapshot.customer_phone || "unknown"}`
        : undefined,
      direction: snapshot.direction as CallDirection | null,
      recording_url: snapshot.recording_url,
      started_at: snapshot.started_at,
      answered_at: snapshot.answered_at,
      ended_at: snapshot.ended_at,
      customer_phone: snapshot.customer_phone,
    });
  } else {
    applySnapshotToCall(call, snapshot);
    if (!call.lead_id && resolution.lead) call.lead_id = resolution.lead.id;
    if (!call.user_id && agent) {
      call.user_id = agent.id;
      call.user_name = agent.name;
    }
    if (resolution.unmatched && snapshot.customer_phone && !call.notes) {
      call.notes = `Unmatched number: ${snapshot.customer_phone}`;
    }
  }

  try {
    await callRepository.save(call);
  } catch (error: any) {
    // Unique race: another event inserted first — reload and patch.
    if (error?.code === "ER_DUP_ENTRY" || error?.errno === 1062) {
      const existing = await callRepository.findOne({ where: { tata_call_id: callId } });
      if (existing) {
        applySnapshotToCall(existing, snapshot);
        if (!existing.lead_id && resolution.lead) existing.lead_id = resolution.lead.id;
        await callRepository.save(existing);
        call = existing;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  if (resolution.unmatched && isTerminalEvent(payload.event as string)) {
    await notifyUnmatchedCall(snapshot);
  }

  if (resolution.ambiguous && resolution.lead && !hadTerminalOutcome && isTerminalEvent(payload.event as string)) {
    await logAmbiguousMatch(resolution.lead, snapshot, resolution.allNames);
  }

  if (resolution.lead && snapshot.outcome && !hadTerminalOutcome) {
    await applyCallCompletion({
      lead: resolution.lead,
      userId: call.user_id,
      userName: call.user_name,
      outcome: snapshot.outcome,
      details: `Outcome: ${snapshot.outcome}${snapshot.recording_url ? " (recording attached)" : ""}`,
    });
  }

  return call;
}

export async function initiateClickToCall(params: {
  lead: Lead;
  user: User;
}): Promise<{ call_id: string; call: Call; mock: boolean }> {
  if (!params.user.tata_extension) {
    const err: any = new Error("Agent extension not configured");
    err.status = 400;
    throw err;
  }

  const customerNumber = toE164(params.lead.phone);
  if (!customerNumber) {
    const err: any = new Error("Lead has no valid phone number");
    err.status = 400;
    throw err;
  }

  let tataCallId: string;
  let mock = false;

  if (MOCK_MODE() || !SMARTFLO_API_KEY()) {
    if (!MOCK_MODE() && !SMARTFLO_API_KEY()) {
      const err: any = new Error("Tata Smartflo API key is not configured");
      err.status = 503;
      throw err;
    }
    mock = true;
    tataCallId = `mock-${uuidv4()}`;
  } else {
    const body: Record<string, unknown> = {
      agent_number: params.user.tata_extension,
      customer_number: customerNumber,
      reference_id: params.lead.id,
      record_call: true,
    };
    if (CALLER_ID()) body.caller_id = CALLER_ID();

    const response = await fetch(`${SMARTFLO_BASE_URL()}/v1/click_to_call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SMARTFLO_API_KEY()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => ({}))) as {
      status?: string;
      call_id?: string;
      message?: string;
      error_code?: string;
    };

    if (!response.ok || data.status === "error" || !data.call_id) {
      const err: any = new Error(data.message || "Failed to initiate call");
      err.status = response.status >= 400 ? response.status : 502;
      throw err;
    }
    tataCallId = data.call_id;
  }

  const callRepository = AppDataSource.getRepository(Call);
  const call = callRepository.create({
    id: uuidv4(),
    lead_id: params.lead.id,
    user_id: params.user.id,
    user_name: params.user.name,
    outcome: null,
    duration_minutes: 0,
    direction: CallDirection.OUTBOUND,
    tata_call_id: tataCallId,
    started_at: new Date(),
    customer_phone: params.lead.phone,
  });
  try {
    await callRepository.save(call);
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY" || error?.errno === 1062) {
      const existing = await callRepository.findOne({ where: { tata_call_id: tataCallId } });
      if (existing) {
        return { call_id: tataCallId, call: existing, mock };
      }
    }
    throw error;
  }

  return { call_id: tataCallId, call, mock };
}
