import { LeadStatus, PaymentStatus } from "../entities";

/** Same 5-day threshold as the idle_lead escalation job in index.ts. */
export const IDLE_LEAD_DAYS = 5;

/** Same exclusions as GET /dashboard/overdue-followups (all past-due, not the 24h notification window). */
export const OVERDUE_EXCLUDE_STATUSES: LeadStatus[] = [LeadStatus.WON, LeadStatus.LOST];

/** Same exclusions as the idle_lead job. */
export const IDLE_EXCLUDE_STATUSES: LeadStatus[] = [
  LeadStatus.WON,
  LeadStatus.LOST,
  LeadStatus.NOT_INTERESTED,
];

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DelayLeadInput {
  id?: string;
  name: string;
  assigned_to?: string | null;
  assigned_name?: string | null;
  status: string;
  next_followup?: Date | string | null;
  last_activity?: Date | string | null;
  created_at: Date | string;
}

export interface PeriodLeadInput {
  source?: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface PeriodBookingInput {
  payment_status: string;
  payment_amount: number | string;
  created_at: Date | string;
}

export interface AgentPerfInput {
  agent_id: string;
  agent_name: string;
  converted: number;
  total_revenue: number;
}

export interface AgentDelayRow {
  agent_id: string;
  agent_name: string;
  overdue_count: number;
  idle_count: number;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function idleSinceDate(now = new Date()): Date {
  return new Date(now.getTime() - IDLE_LEAD_DAYS * DAY_MS);
}

export function daysBetween(from: Date | string | null | undefined, now: Date): number {
  const start = asDate(from);
  if (!start) return 0;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / DAY_MS));
}

/**
 * Overdue follow-up: next_followup in the past, not won/lost.
 * Matches GET /dashboard/overdue-followups, not the 24h followup_missed notification window.
 */
export function isOverdueFollowup(lead: DelayLeadInput, now: Date): boolean {
  const followup = asDate(lead.next_followup);
  if (!followup) return false;
  if (OVERDUE_EXCLUDE_STATUSES.includes(lead.status as LeadStatus)) return false;
  return followup < now;
}

/**
 * Idle: active (not won/lost/not_interested), created 5+ days ago,
 * last_activity older than 5 days or null. Same shape as the idle_lead job.
 */
export function isIdleLead(lead: DelayLeadInput, now: Date): boolean {
  if (IDLE_EXCLUDE_STATUSES.includes(lead.status as LeadStatus)) return false;
  const created = asDate(lead.created_at);
  if (!created) return false;
  const cutoff = idleSinceDate(now);
  if (created >= cutoff) return false;
  const last = asDate(lead.last_activity);
  return last == null || last < cutoff;
}

export function daysOverdue(lead: DelayLeadInput, now: Date): number {
  return daysBetween(lead.next_followup, now);
}

export function daysIdle(lead: DelayLeadInput, now: Date): number {
  return daysBetween(asDate(lead.last_activity) || lead.created_at, now);
}

export function rollupAgentDelay(
  overdue: DelayLeadInput[],
  idle: DelayLeadInput[]
): AgentDelayRow[] {
  const byAgent = new Map<string, AgentDelayRow>();

  const bucket = (lead: DelayLeadInput): AgentDelayRow => {
    const agent_id = lead.assigned_to || "unassigned";
    const agent_name = lead.assigned_name || "Unassigned";
    let row = byAgent.get(agent_id);
    if (!row) {
      row = { agent_id, agent_name, overdue_count: 0, idle_count: 0 };
      byAgent.set(agent_id, row);
    }
    return row;
  };

  for (const lead of overdue) bucket(lead).overdue_count += 1;
  for (const lead of idle) bucket(lead).idle_count += 1;

  return [...byAgent.values()].sort(
    (a, b) => b.overdue_count + b.idle_count - (a.overdue_count + a.idle_count) || a.agent_name.localeCompare(b.agent_name)
  );
}

function inRange(value: Date | string, start: Date, end?: Date): boolean {
  const d = asDate(value);
  if (!d) return false;
  if (d < start) return false;
  if (end && d >= end) return false;
  return true;
}

/**
 * Same close/revenue definitions as GET /dashboard/stats monthly_* fields:
 * - new leads: created_at in [start, end)
 * - closed won/lost: current status + updated_at in [start, end) (updated_at is the close-time proxy)
 * - revenue: paid/partial bookings with created_at in [start, end)
 * When `end` is omitted, matches dashboard (no upper bound).
 */
export function countPeriodMetrics(
  leads: PeriodLeadInput[],
  bookings: PeriodBookingInput[],
  start: Date,
  end?: Date
) {
  const newLeads = leads.filter((l) => inRange(l.created_at, start, end));
  const closedWon = leads.filter((l) => l.status === LeadStatus.WON && inRange(l.updated_at, start, end));
  const closedLost = leads.filter((l) => l.status === LeadStatus.LOST && inRange(l.updated_at, start, end));
  const paid = [PaymentStatus.PAID, PaymentStatus.PARTIAL] as string[];
  const revenue = bookings
    .filter((b) => paid.includes(b.payment_status) && inRange(b.created_at, start, end))
    .reduce((sum, b) => sum + parseFloat(String(b.payment_amount || 0)), 0);

  const bySource = new Map<string, number>();
  for (const lead of newLeads) {
    const source = (lead.source || "").trim() || "Unknown";
    bySource.set(source, (bySource.get(source) || 0) + 1);
  }

  const processed = closedWon.length + closedLost.length;
  return {
    new_leads: newLeads.length,
    closed_won: closedWon.length,
    closed_lost: closedLost.length,
    revenue,
    conversion_rate: processed > 0 ? Math.round((closedWon.length / processed) * 100) : 0,
    new_leads_by_source: [...bySource.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
  };
}

export function rankAgents(agents: AgentPerfInput[], n = 3): { top: AgentPerfInput[]; bottom: AgentPerfInput[] } {
  const real = agents.filter((a) => a.agent_id !== "system");
  const sorted = [...real].sort(
    (a, b) => b.converted - a.converted || b.total_revenue - a.total_revenue || a.agent_name.localeCompare(b.agent_name)
  );
  return {
    top: sorted.slice(0, n),
    bottom: [...sorted].reverse().slice(0, n),
  };
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatMinutesAsDuration(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return "—";
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

const REPORT_TZ = "Asia/Kolkata";

export function formatReportDateTime(value: Date | string | null | undefined): string {
  const d = asDate(value);
  if (!d) return "—";
  return d.toLocaleString("en-IN", {
    timeZone: REPORT_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatReportDate(value: Date | string): string {
  const d = asDate(value);
  if (!d) return "";
  return d.toLocaleDateString("en-IN", {
    timeZone: REPORT_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatReportMonth(value: Date): string {
  return value.toLocaleDateString("en-IN", {
    timeZone: REPORT_TZ,
    month: "long",
    year: "numeric",
  });
}

export function isoDateStamp(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}
