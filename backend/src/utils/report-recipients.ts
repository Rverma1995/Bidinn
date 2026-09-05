/**
 * REPORT_RECIPIENT_EMAILS is a fixed comma-separated list — not looked up from users.
 * Empty / missing config must not crash the process; callers log a warning and skip send.
 */
export function parseReportRecipientEmails(raw?: string | null): string[] {
  if (raw == null || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function loadReportRecipients(): string[] {
  return parseReportRecipientEmails(process.env.REPORT_RECIPIENT_EMAILS);
}

export function warnIfNoReportRecipients(recipients: string[]): boolean {
  if (recipients.length === 0) {
    console.warn(
      "REPORT_RECIPIENT_EMAILS is missing or empty; scheduled email reports will not send"
    );
    return true;
  }
  return false;
}
