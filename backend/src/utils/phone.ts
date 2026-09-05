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
