import { CallOutcome } from "../entities/Call";
import { secondsToMinutes } from "../utils/phone";

export type CallDirection = "inbound" | "outbound";

export type TataWebhookEvent = "call.started" | "call.answered" | "call.ended" | "call.missed";

export interface TataWebhookData {
  call_id?: string;
  direction?: CallDirection | string;
  caller_number?: string;
  called_number?: string;
  customer_number?: string;
  agent_number?: string;
  reference_id?: string;
  duration?: number;
  status?: string;
  recording_url?: string;
  hangup_cause?: string;
  timestamp?: string;
}

export interface TataWebhookPayload {
  event?: TataWebhookEvent | string;
  timestamp?: string;
  data?: TataWebhookData;
  signature?: string;
}

export interface CallSnapshot {
  tata_call_id: string;
  direction: CallDirection | null;
  outcome: CallOutcome | null;
  recording_url: string | null;
  started_at: Date | null;
  answered_at: Date | null;
  ended_at: Date | null;
  duration_minutes: number;
  lead_id: string | null;
  customer_phone: string | null;
  agent_number: string | null;
}

function parseTime(value?: string | Date | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapTataStatusToOutcome(
  status: string | null | undefined,
  event?: string,
  durationSeconds?: number
): CallOutcome {
  const s = String(status || "").toLowerCase().replace(/[\s-]+/g, "_");

  if (event === "call.missed") return CallOutcome.NO_ANSWER;

  switch (s) {
    case "answered":
    case "completed":
    case "connected":
    case "success":
      return CallOutcome.CONNECTED;
    case "no_answer":
    case "unanswered":
    case "missed":
    case "not_answered":
      return CallOutcome.NO_ANSWER;
    case "busy":
      return CallOutcome.BUSY;
    case "voicemail":
      return CallOutcome.VOICEMAIL;
    case "wrong_number":
    case "invalid":
      return CallOutcome.WRONG_NUMBER;
    case "callback":
    case "callback_requested":
      return CallOutcome.CALLBACK_REQUESTED;
    default:
      break;
  }

  if (event === "call.ended") {
    if (durationSeconds && durationSeconds > 0) return CallOutcome.CONNECTED;
    return CallOutcome.NO_ANSWER;
  }
  return CallOutcome.NO_ANSWER;
}

/** Customer number: inbound = caller, outbound = called / customer_number. */
export function extractCustomerNumber(data: TataWebhookData | undefined, direction?: string | null): string {
  if (!data) return "";
  const dir = String(direction || data.direction || "").toLowerCase();
  if (dir === "inbound") {
    return data.caller_number || data.customer_number || "";
  }
  if (dir === "outbound") {
    return data.customer_number || data.called_number || "";
  }
  return data.customer_number || data.caller_number || data.called_number || "";
}

function emptySnapshot(callId: string): CallSnapshot {
  return {
    tata_call_id: callId,
    direction: null,
    outcome: null,
    recording_url: null,
    started_at: null,
    answered_at: null,
    ended_at: null,
    duration_minutes: 0,
    lead_id: null,
    customer_phone: null,
    agent_number: null,
  };
}

/**
 * Pure merge of one webhook event onto an existing (or new) call row.
 * Later events patch; they never fork a second identity for the same tata_call_id.
 */
export function mergeWebhookEvent(existing: CallSnapshot | null, payload: TataWebhookPayload): CallSnapshot {
  const data = payload.data || {};
  const callId = data.call_id || existing?.tata_call_id || "";
  const merged: CallSnapshot = existing ? { ...existing } : emptySnapshot(callId);
  merged.tata_call_id = callId;

  const eventTime = parseTime(payload.timestamp) || parseTime(data.timestamp) || new Date();
  const direction = (data.direction || merged.direction) as CallDirection | null;
  if (data.direction === "inbound" || data.direction === "outbound") {
    merged.direction = data.direction;
  }

  const customer = extractCustomerNumber(data, direction || merged.direction);
  if (customer) merged.customer_phone = customer;
  if (data.agent_number) merged.agent_number = data.agent_number;
  if (data.reference_id && !merged.lead_id) merged.lead_id = data.reference_id;
  if (data.recording_url) merged.recording_url = data.recording_url;

  switch (payload.event) {
    case "call.started":
      if (!merged.started_at) merged.started_at = eventTime;
      break;
    case "call.answered":
      if (!merged.answered_at) merged.answered_at = eventTime;
      if (!merged.started_at) merged.started_at = eventTime;
      break;
    case "call.ended": {
      if (!merged.ended_at) merged.ended_at = eventTime;
      if (!merged.started_at) merged.started_at = eventTime;
      if (data.duration != null) merged.duration_minutes = secondsToMinutes(data.duration);
      merged.outcome = mapTataStatusToOutcome(data.status, "call.ended", data.duration);
      break;
    }
    case "call.missed":
      if (!merged.ended_at) merged.ended_at = eventTime;
      if (!merged.started_at) merged.started_at = eventTime;
      merged.outcome = CallOutcome.NO_ANSWER;
      break;
    default:
      break;
  }

  return merged;
}

export function isTerminalEvent(event?: string): boolean {
  return event === "call.ended" || event === "call.missed";
}
