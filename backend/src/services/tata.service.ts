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
  normalizeSmartfloWebhookPayload,
} from "./tata-webhook";
import {
  callNeedsCdrResync,
  cdrRecordToPatch,
  formatSmartfloCdrDate,
  matchLiveCall,
  pickSmartfloCdrRecord,
  SmartfloLiveState,
} from "./tata-cdr";
import { toSmartfloAgentNumber, toSmartfloCallerId, toSmartfloClickToCallDestination, toSmartfloDestinationNumber } from "../utils/phone";
import { sendPushForNotifications } from "./web-push.service";

const SMARTFLO_API_KEY = () => {
  const raw = (process.env.TATA_SMARTFLO_API_KEY || "").trim();
  if (raw.toLowerCase().startsWith("bearer ")) {
    return raw.slice(7).trim();
  }
  return raw;
};

function assertValidSmartfloApiToken(token: string): void {
  if (!token) return;
  if (!/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    const err: any = new Error(
      "TATA_SMARTFLO_API_KEY is invalid. Copy the API token from Smartflo → API Connect (it should start with eyJ...)."
    );
    err.status = 503;
    throw err;
  }
}
const SMARTFLO_BASE_URL = () =>
  process.env.TATA_SMARTFLO_BASE_URL || "https://api-smartflo.tatateleservices.com";
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

function timingSafeEqualString(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

/**
 * Smartflo webhooks do not compute HMAC signatures. In the portal you can add a static
 * header (e.g. x-bidinn-webhook-token) whose value matches TATA_SMARTFLO_WEBHOOK_SECRET.
 * HMAC via x-smartflo-signature: sha256=... is still supported for manual/testing use.
 */
export function verifyTataWebhookAuth(
  rawBody: Buffer | string,
  headers: {
    "x-smartflo-signature"?: string;
    "x-bidinn-webhook-token"?: string;
    "x-webhook-secret"?: string;
    authorization?: string;
  },
  bodySignature?: string
): boolean {
  const secret = WEBHOOK_SECRET();
  if (!secret) return true;

  const signature = headers["x-smartflo-signature"] || bodySignature;
  const bearer = headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  const staticCandidates = [
    headers["x-bidinn-webhook-token"],
    headers["x-webhook-secret"],
    bearer,
    // Smartflo "Headers" UI: static shared secret (may be 64-char hex — not an HMAC digest)
    signature,
  ].filter(Boolean) as string[];

  if (staticCandidates.some((candidate) => timingSafeEqualString(candidate, secret))) {
    return true;
  }

  if (signature?.startsWith("sha256=")) {
    return verifyTataWebhookSignature(rawBody, signature);
  }

  // Bare 64-char hex: only accept if it is the real HMAC of this body (not a static secret)
  if (signature && /^[a-f0-9]{64}$/i.test(signature)) {
    return verifyTataWebhookSignature(rawBody, signature);
  }

  return false;
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
    void sendPushForNotifications([notification]);
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
async function findCallByTataIds(
  callRepository: ReturnType<typeof AppDataSource.getRepository<Call>>,
  refId?: string | null,
  telephonyId?: string | null
): Promise<Call | null> {
  if (refId) {
    const byRef = await callRepository.findOne({ where: { tata_call_id: refId } });
    if (byRef) return byRef;
  }
  if (telephonyId && telephonyId !== refId) {
    return callRepository.findOne({ where: { tata_call_id: telephonyId } });
  }
  return null;
}

async function smartfloGetJson(pathAndQuery: string): Promise<{ ok: boolean; body: any }> {
  try {
    const response = await fetch(`${SMARTFLO_BASE_URL()}${pathAndQuery}`, {
      headers: {
        Authorization: `Bearer ${SMARTFLO_API_KEY()}`,
        Accept: "application/json",
      },
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, body };
  } catch {
    return { ok: false, body: {} };
  }
}

async function fetchSmartfloCdrRows(params: URLSearchParams): Promise<Array<Record<string, unknown>>> {
  const { ok, body } = await smartfloGetJson(`/v1/call/records?${params.toString()}`);
  if (!ok || !Array.isArray(body?.results)) return [];
  return body.results as Array<Record<string, unknown>>;
}

async function fetchSmartfloLiveCalls(): Promise<Array<Record<string, unknown>>> {
  const { ok, body } = await smartfloGetJson("/v1/live_calls");
  if (!ok) return [];
  if (Array.isArray(body)) return body as Array<Record<string, unknown>>;
  if (Array.isArray(body?.calls)) return body.calls as Array<Record<string, unknown>>;
  return [];
}

function attachLiveState<T extends Call>(call: T, liveState: SmartfloLiveState | null): T & { live_state: SmartfloLiveState | null } {
  return Object.assign(call, { live_state: liveState });
}

async function finalizeCdrCall(call: Call, alreadyHadOutcome: boolean): Promise<void> {
  if (!call.outcome || !call.ended_at || !call.lead_id) return;

  if (call.outcome === CallOutcome.CONNECTED && call.answered_at) {
    if (!call.wrap_up_completed) {
      await AppDataSource.getRepository(Call).save(call);
    }
    return;
  }

  if (alreadyHadOutcome || call.wrap_up_completed) return;

  const lead = await AppDataSource.getRepository(Lead).findOne({ where: { id: call.lead_id } });
  if (!lead) return;

  call.wrap_up_completed = true;
  await AppDataSource.getRepository(Call).save(call);
  await applyCallCompletion({
    lead,
    userId: call.user_id,
    userName: call.user_name,
    outcome: call.outcome,
    details: `Outcome: ${call.outcome}${call.recording_url ? " (recording attached)" : ""}`,
    incrementAttempt: true,
  });
}

/** Poll Smartflo CDR / live calls when webhooks are unavailable (e.g. local dev). */
export async function syncCallFromSmartfloCdr(tataCallId: string): Promise<(Call & { live_state?: SmartfloLiveState | null }) | null> {
  const callRepository = AppDataSource.getRepository(Call);
  const call = await callRepository.findOne({ where: { tata_call_id: tataCallId } });
  if (!call) return call;
  if (call.ended_at && !callNeedsCdrResync(call)) return attachLiveState(call, null);

  if (MOCK_MODE() || !SMARTFLO_API_KEY()) return attachLiveState(call, null);

  const started = call.started_at || call.created_at;
  const destination = toSmartfloDestinationNumber(call.customer_phone);
  let liveState: SmartfloLiveState | null = null;

  const liveCalls = await fetchSmartfloLiveCalls();
  if (liveCalls.length) {
    let agentExtension: string | null = null;
    if (call.user_id) {
      const agent = await AppDataSource.getRepository(User).findOne({ where: { id: call.user_id } });
      agentExtension = agent?.tata_extension || null;
    }
    const live = matchLiveCall(liveCalls, {
      customerPhone: call.customer_phone,
      agentExtension,
    });
    if (live) {
      liveState = live.state;
      if (live.state === "live" && !call.answered_at) {
        call.answered_at = new Date();
        await callRepository.save(call);
      }
      // Do not close this click-to-call from an older CDR while Smartflo still shows it ringing.
      if (live.state !== "live") {
        return attachLiveState(call, liveState);
      }
    }
  }

  if (!destination) return attachLiveState(call, liveState);

  const window = {
    from_date: formatSmartfloCdrDate(new Date(started.getTime() - 5 * 60 * 1000)),
    to_date: formatSmartfloCdrDate(new Date(Date.now() + 2 * 60 * 1000)),
    direction: "outbound",
    limit: "50",
    page: "1",
  };
  let rows = await fetchSmartfloCdrRows(
    new URLSearchParams({ ...window, destination })
  );
  if (!rows.some((row) => String(row.ref_id || "") === tataCallId)) {
    const withCaller = await fetchSmartfloCdrRows(
      new URLSearchParams({ ...window, callerid: destination })
    );
    rows = rows.concat(withCaller);
  }

  const record = pickSmartfloCdrRecord(rows, {
    tataCallId,
    customerPhone: call.customer_phone,
    startedMs: started.getTime(),
  });
  if (!record) return attachLiveState(call, liveState);

  const refMatches = String(record.ref_id || "") === tataCallId;
  // While the agent/DID is still ringing, a nearby older CDR must not close this call.
  if (!refMatches && (liveState || Date.now() - started.getTime() < 20_000)) {
    return attachLiveState(call, liveState);
  }

  const alreadyHadOutcome = !!call.outcome && !!call.ended_at;
  const patch = cdrRecordToPatch(record, started);
  if (patch.started_at) call.started_at = patch.started_at;
  if (patch.answered_at) call.answered_at = patch.answered_at;
  if (patch.outcome) call.outcome = patch.outcome;
  if (patch.recording_url) call.recording_url = patch.recording_url;
  call.duration_minutes = patch.duration_minutes;
  if (patch.ended_at) {
    call.ended_at = patch.ended_at;
    call.wrap_up_completed = patch.wrap_up_completed;
  }

  await callRepository.save(call);
  await finalizeCdrCall(call, alreadyHadOutcome);
  return attachLiveState(call, call.ended_at ? null : liveState);
}

export async function syncPendingTataCallsForLead(leadId: string): Promise<void> {
  const pending = await AppDataSource.getRepository(Call).find({
    where: { lead_id: leadId },
    order: { created_at: "DESC" },
    take: 20,
  });
  const open = pending.filter((c) => c.tata_call_id && callNeedsCdrResync(c)).slice(0, 3);
  for (const row of open) {
    await syncCallFromSmartfloCdr(row.tata_call_id!);
  }
}

export async function upsertTataWebhookEvent(payload: TataWebhookPayload): Promise<Call> {
  const data = payload.data || {};
  const refId = data.ref_id || null;
  const telephonyId = data.call_id || null;
  const lookupId = refId || telephonyId;
  if (!lookupId) {
    throw new Error("Webhook missing call_id or ref_id");
  }

  const callRepository = AppDataSource.getRepository(Call);
  let call = await findCallByTataIds(callRepository, refId, telephonyId);

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
      tata_call_id: lookupId,
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
      const existing = await findCallByTataIds(callRepository, refId, telephonyId);
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
    const wasAnswered =
      !!snapshot.answered_at ||
      (snapshot.outcome === CallOutcome.CONNECTED && (snapshot.duration_minutes || 0) > 0);

    if (wasAnswered && snapshot.outcome === CallOutcome.CONNECTED) {
      call.wrap_up_completed = false;
      call.outcome = CallOutcome.CONNECTED;
      await callRepository.save(call);
    } else {
      call.wrap_up_completed = true;
      await callRepository.save(call);
      await applyCallCompletion({
        lead: resolution.lead,
        userId: call.user_id,
        userName: call.user_name,
        outcome: snapshot.outcome,
        details: `Outcome: ${snapshot.outcome}${snapshot.recording_url ? " (recording attached)" : ""}`,
      });
    }
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

  const agentNumber = toSmartfloAgentNumber(params.user.tata_extension);
  if (!agentNumber) {
    const err: any = new Error("Agent extension is not a valid Smartflo agent number");
    err.status = 400;
    throw err;
  }

  const destinationNumber = toSmartfloClickToCallDestination(params.lead.phone);
  if (!destinationNumber) {
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
    const apiToken = SMARTFLO_API_KEY();
    assertValidSmartfloApiToken(apiToken);

    const body: Record<string, unknown> = {
      agent_number: agentNumber,
      destination_number: destinationNumber,
      async: 1,
    };
    const callerId = toSmartfloCallerId(CALLER_ID());
    if (callerId) body.caller_id = callerId;

    let response: Response;
    try {
      response = await fetch(`${SMARTFLO_BASE_URL()}/v1/click_to_call`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (networkError: any) {
      const cause = networkError?.cause as { code?: string } | undefined;
      const err: any = new Error(
        cause?.code === "ENOTFOUND"
          ? `Cannot reach Tata Smartflo API (${SMARTFLO_BASE_URL()}). Check TATA_SMARTFLO_BASE_URL and network connectivity.`
          : `Tata Smartflo API request failed: ${networkError?.message || "network error"}`
      );
      err.status = 502;
      throw err;
    }

    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      ok?: boolean;
      ref_id?: string;
      call_id?: string;
      message?: string;
      error?: string;
      status?: string;
      error_code?: string;
    };

    const callRef = data.ref_id || data.call_id;
    if (!response.ok || data.success === false || data.ok === false || !callRef) {
      let message = data.message || data.error || "Failed to initiate call";
      if (/DID Selected|Outbound calling is disabled/i.test(message)) {
        message +=
          " Set TATA_SMARTFLO_CALLER_ID to a valid outbound-enabled DID from Smartflo, or leave it empty to use your account default.";
      }
      console.warn("Click-to-call rejected by Smartflo:", response.status, data);
      const err: any = new Error(message);
      err.status = response.status >= 400 ? response.status : 502;
      throw err;
    }
    tataCallId = callRef;
    console.log(
      `Click-to-call queued ref_id=${tataCallId} agent=${agentNumber} destination=${destinationNumber}`
    );
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
    wrap_up_completed: false,
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

  if (mock) {
    const savedCallId = call.id;
    setTimeout(async () => {
      try {
        const row = await callRepository.findOne({ where: { id: savedCallId } });
        if (!row || row.ended_at) return;
        const ended = new Date();
        row.answered_at = ended;
        row.ended_at = ended;
        row.duration_minutes = 2;
        row.outcome = CallOutcome.CONNECTED;
        row.wrap_up_completed = false;
        await callRepository.save(row);
      } catch (err) {
        console.error("Mock call completion error:", err);
      }
    }, 4000);
  }

  return { call_id: tataCallId, call, mock };
}
