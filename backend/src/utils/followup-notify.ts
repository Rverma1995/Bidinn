import { NotificationType } from "../entities";

/** Hourly job: upcoming window is the next 60 minutes. */
export const FOLLOWUP_UPCOMING_WINDOW_MS = 60 * 60 * 1000;

/** Missed notifications only cover the last 24 hours (older items are not re-spammed). */
export const FOLLOWUP_MISSED_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Same type+lead+user is not recreated within ~2 hours. */
export const FOLLOWUP_DEDUP_MS = 2 * 60 * 60 * 1000;

export const FOLLOWUP_EXCLUDE_STATUSES = ["won", "lost"] as const;

export function shouldNotifyFollowupAssignee(lead: { assigned_to?: string | null }): boolean {
  return Boolean(lead?.assigned_to);
}

export function isExcludedFollowupStatus(status?: string | null): boolean {
  return FOLLOWUP_EXCLUDE_STATUSES.includes(status as (typeof FOLLOWUP_EXCLUDE_STATUSES)[number]);
}

export function isInUpcomingFollowupWindow(
  nextFollowup: Date | string | null | undefined,
  now: Date,
  windowMs = FOLLOWUP_UPCOMING_WINDOW_MS
): boolean {
  if (!nextFollowup) return false;
  const t = new Date(nextFollowup).getTime();
  if (Number.isNaN(t)) return false;
  return t > now.getTime() && t <= now.getTime() + windowMs;
}

export function isInMissedFollowupWindow(
  nextFollowup: Date | string | null | undefined,
  now: Date,
  lookbackMs = FOLLOWUP_MISSED_LOOKBACK_MS
): boolean {
  if (!nextFollowup) return false;
  const t = new Date(nextFollowup).getTime();
  if (Number.isNaN(t)) return false;
  return t < now.getTime() && t > now.getTime() - lookbackMs;
}

export function followupDedupKey(userId: string, leadId: string): string {
  return `${userId}_${leadId}`;
}

export function formatOverdueLabel(overdueMinutes: number): string {
  return overdueMinutes >= 60 ? `${Math.round(overdueMinutes / 60)}h` : `${overdueMinutes}m`;
}

export function buildFollowupNotice(opts: {
  type: NotificationType.FOLLOWUP_UPCOMING | NotificationType.FOLLOWUP_MISSED | string;
  leadName: string;
  leadPhone: string;
  followupTime: Date;
  now: Date;
}): { title: string; message: string; overdueMinutes?: number } {
  const timeLabel = opts.followupTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  if (opts.type === NotificationType.FOLLOWUP_UPCOMING || opts.type === "followup_upcoming") {
    const minsUntil = Math.round((opts.followupTime.getTime() - opts.now.getTime()) / 60000);
    return {
      title: `Upcoming Follow-up in ${minsUntil} min`,
      message: `${opts.leadName} (${opts.leadPhone}) has a follow-up scheduled at ${timeLabel}`,
    };
  }

  const overdueMinutes = Math.round((opts.now.getTime() - opts.followupTime.getTime()) / 60000);
  return {
    title: `Missed Follow-up (${formatOverdueLabel(overdueMinutes)} overdue)`,
    message: `${opts.leadName} (${opts.leadPhone}) had a follow-up at ${timeLabel} that was missed.`,
    overdueMinutes,
  };
}
