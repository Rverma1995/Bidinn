/**
 * Canonical phone matching for Bidinn CRM.
 *
 * Indian mobiles are stored as a bare 10-digit form so webhook payloads
 * (`+9198…`, `9198…`, `098…`) match what reps type (`98765 43210`).
 * Non-Indian numbers keep all digits after formatting is stripped.
 */

/** Strip formatting, then a leading India country (91) or trunk (0) prefix. */
export function normalizePhone(raw: string | null | undefined): string {
  if (raw == null) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";

  // 91 + optional trunk 0 + 10-digit mobile (12 or 13 digits)
  if (digits.length >= 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits;
}

/** Smartflo agent_number: registered mobile (10-digit), agent ID (050…), or softphone extension (060…). */
export function toSmartfloAgentNumber(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (/^0[56]0\d+/.test(digits)) return digits;
  if (digits.length < 10) return digits;
  const mobile = normalizePhone(trimmed);
  if (mobile.length === 10) return mobile;
  return digits;
}

/** Smartflo click-to-call destination — bare digits, typically 10-digit Indian mobile. */
export function toSmartfloDestinationNumber(raw: string | null | undefined): string {
  return normalizePhone(raw);
}

/**
 * Number Tata actually dials on the customer leg.
 * 10-digit Indian mobiles must include country code 91. Without it, ClickToCall
 * for a 060 softphone dials +0XXXXXXXXXX (chanunavail) after the agent answers.
 */
export function toSmartfloClickToCallDestination(raw: string | null | undefined): string {
  const ten = normalizePhone(raw);
  if (!ten) return "";
  if (ten.length === 10) return `91${ten}`;
  return ten;
}

export function isSmartfloDialerExtension(raw: string | null | undefined): boolean {
  return /^0[56]0\d+/.test(String(raw || "").replace(/\D/g, ""));
}

/** Smartflo caller ID / DID — digits only, e.g. 919876543210. */
export function toSmartfloCallerId(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw).replace(/\D/g, "");
}

/** E.164 for Tata click-to-call. 10-digit Indian numbers become +91XXXXXXXXXX. */
export function toE164(raw: string | null | undefined): string {
  const normalized = normalizePhone(raw);
  if (!normalized) return "";
  if (normalized.length === 10) return `+91${normalized}`;
  if (String(raw || "").trim().startsWith("+")) return `+${normalized}`;
  return `+${normalized}`;
}

export function secondsToMinutes(durationSeconds: number | null | undefined): number {
  if (durationSeconds == null || Number.isNaN(Number(durationSeconds))) return 0;
  const seconds = Number(durationSeconds);
  if (seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds / 60));
}
