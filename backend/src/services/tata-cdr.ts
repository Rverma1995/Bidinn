import { CallOutcome } from "../entities/Call";
import { toSmartfloDestinationNumber } from "../utils/phone";

const IST = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type SmartfloLiveState = "ringing_agent" | "calling_customer" | "live";

export interface SmartfloCdrPatch {
  answered_at: Date | null;
  ended_at: Date | null;
  outcome: CallOutcome | null;
  duration_minutes: number;
  recording_url: string | null;
  wrap_up_completed: boolean;
}

export function formatSmartfloCdrDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

/** Tata CDR timestamps are IST without a timezone suffix. */
export function parseSmartfloIstDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = String(value)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const utcMs =
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) -
    IST_OFFSET_MS;
  return new Date(utcMs);
}

export function phonesMatchForCdr(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = toSmartfloDestinationNumber(a);
  const nb = toSmartfloDestinationNumber(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return `91${na}` === nb || na === `91${nb}`;
}

export function pickSmartfloCdrRecord(
  rows: Array<Record<string, unknown>>,
  opts: { tataCallId: string; customerPhone: string | null; startedMs: number }
): Record<string, unknown> | null {
  const byRef = rows.find((row) => String(row.ref_id || "") === opts.tataCallId);
  if (byRef) return byRef;

  const destination = toSmartfloDestinationNumber(opts.customerPhone);
  const matches = rows
    .filter((row) => {
      const client = String(row.client_number || row.caller_id_num || "");
      if (!phonesMatchForCdr(client, destination) && !phonesMatchForCdr(opts.customerPhone, client)) {
        return false;
      }
      const stamp = parseSmartfloIstDate(
        String(row.end_stamp || (row.date && row.time ? `${row.date} ${row.time}` : "") || "")
      );
      const t = stamp?.getTime() || 0;
      return t >= opts.startedMs - 120_000;
    })
    .sort((a, b) => {
      const ta = parseSmartfloIstDate(String(a.end_stamp || `${a.date} ${a.time}`))?.getTime() || 0;
      const tb = parseSmartfloIstDate(String(b.end_stamp || `${b.date} ${b.time}`))?.getTime() || 0;
      return tb - ta;
    });

  return matches[0] || null;
}

export function cdrRecordToPatch(record: Record<string, unknown>, fallbackStart: Date): SmartfloCdrPatch {
  const status = String(record.status || record.description || "").toLowerCase();
  const answeredSeconds = Number(record.answered_seconds || 0);
  const callDuration = Number(record.call_duration || 0);
  const endStamp = parseSmartfloIstDate(record.end_stamp ? String(record.end_stamp) : "");
  const startStamp =
    record.date && record.time
      ? parseSmartfloIstDate(`${record.date} ${record.time}`) || fallbackStart
      : fallbackStart;

  const answered = status.includes("answered") || answeredSeconds > 0;
  const missed = status.includes("miss");

  let outcome: CallOutcome | null = null;
  let answeredAt: Date | null = null;
  let wrapUp = false;
  if (answered) {
    outcome = CallOutcome.CONNECTED;
    answeredAt = startStamp;
    wrapUp = false;
  } else if (missed) {
    outcome = CallOutcome.NO_ANSWER;
    wrapUp = true;
  }

  if (endStamp && !outcome) {
    outcome = answeredSeconds > 0 ? CallOutcome.CONNECTED : CallOutcome.NO_ANSWER;
    wrapUp = outcome === CallOutcome.NO_ANSWER;
  } else if (endStamp && outcome === CallOutcome.NO_ANSWER) {
    wrapUp = true;
  }

  return {
    answered_at: answeredAt,
    ended_at: endStamp,
    outcome,
    duration_minutes: callDuration > 0 ? Math.max(1, Math.round(callDuration / 60)) : 0,
    recording_url: record.recording_url ? String(record.recording_url) : null,
    wrap_up_completed: wrapUp,
  };
}

export function matchLiveCall(
  liveCalls: Array<Record<string, unknown>>,
  opts: { customerPhone: string | null; agentExtension?: string | null }
): { state: SmartfloLiveState; raw: Record<string, unknown> } | null {
  const match = liveCalls.find((row) => {
    const customer = String(row.customer_number || row.destination || "");
    const source = String(row.source || "");
    const type = String(row.type || row.multiple_destination_type || "").toLowerCase();
    const isC2c = type.includes("click") || type.includes("c2c");
    if (opts.customerPhone && phonesMatchForCdr(customer, opts.customerPhone)) return true;
    if (opts.agentExtension && source.replace(/\D/g, "").includes(String(opts.agentExtension).replace(/\D/g, ""))) {
      return isC2c || !type;
    }
    return false;
  });
  if (!match) return null;

  const stateRaw = String(match.state || "").toLowerCase();
  const state: SmartfloLiveState = stateRaw.includes("answer")
    ? "live"
    : stateRaw.includes("ring")
      ? "calling_customer"
      : "ringing_agent";
  return { state, raw: match };
}
