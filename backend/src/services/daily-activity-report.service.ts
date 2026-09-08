import { SelectQueryBuilder, ObjectLiteral } from "typeorm";
import { AppDataSource } from "../config/data-source";
import { Call, Lead, LeadStatus } from "../entities";
import { AuthUser } from "../types";
import { startOfCalendarMonth } from "../utils/lead-scope";

const leadRepository = () => AppDataSource.getRepository(Lead);
const callRepository = () => AppDataSource.getRepository(Call);

export type DailyActivityRange = "today" | "week" | "month" | "year";

export interface DailyActivityDateRange {
  range: DailyActivityRange;
  start: Date;
  end: Date;
  label: string;
}

export interface StageBreakdownRow {
  status: LeadStatus;
  count: number;
}

export interface AgentCallCountRow {
  agent_id: string;
  agent_name: string;
  call_count: number;
}

export interface AgentCallTimeRow {
  agent_id: string;
  agent_name: string;
  total_duration_minutes: number;
  total_duration_seconds: number;
}

export interface DailyActivityReportResult {
  range: DailyActivityRange;
  start_date: string;
  end_date: string;
  range_label: string;
  view_scope: "all" | "self";
  total_leads_generated: number;
  leads_contacted: {
    total: number;
    by_stage: StageBreakdownRow[];
  };
  calls_by_agent: AgentCallCountRow[];
  call_time_available: boolean;
  call_time_by_agent: AgentCallTimeRow[];
}

/** Admin sees org-wide metrics; every other role sees only their own data. */
export function isDailyReportAdmin(user: AuthUser): boolean {
  return user.role === "admin";
}

export function applyDailyReportLeadScope<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  user: AuthUser,
  alias = "lead"
): SelectQueryBuilder<T> {
  if (!isDailyReportAdmin(user)) {
    queryBuilder.andWhere(`${alias}.assigned_to = :dailyReportViewerId`, {
      dailyReportViewerId: user.id,
    });
  }
  return queryBuilder;
}

export function applyDailyReportCallScope<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  user: AuthUser,
  alias = "call"
): SelectQueryBuilder<T> {
  if (!isDailyReportAdmin(user)) {
    queryBuilder.andWhere(`${alias}.user_id = :dailyReportViewerId`, {
      dailyReportViewerId: user.id,
    });
  }
  return queryBuilder;
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Monday-start calendar week in server local timezone. */
function startOfWeek(now: Date): Date {
  const start = startOfToday(now);
  const day = start.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - daysFromMonday);
  return start;
}

function startOfYear(now: Date): Date {
  return new Date(now.getFullYear(), 0, 1);
}

const RANGE_LABELS: Record<DailyActivityRange, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  year: "This Year",
};

export function parseDailyActivityRange(
  value: unknown,
  now = new Date()
): DailyActivityDateRange | null {
  if (value !== "today" && value !== "week" && value !== "month" && value !== "year") {
    return null;
  }

  const range = value as DailyActivityRange;
  const end = now;
  let start: Date;

  switch (range) {
    case "today":
      start = startOfToday(now);
      break;
    case "week":
      start = startOfWeek(now);
      break;
    case "month":
      start = startOfCalendarMonth(now);
      break;
    case "year":
      start = startOfYear(now);
      break;
  }

  return { range, start, end, label: RANGE_LABELS[range] };
}

function emptyStageBreakdown(): StageBreakdownRow[] {
  return Object.values(LeadStatus).map((status) => ({ status, count: 0 }));
}

async function countLeadsGenerated(user: AuthUser, start: Date, end: Date): Promise<number> {
  const query = leadRepository()
    .createQueryBuilder("lead")
    .where("lead.created_at >= :start", { start })
    .andWhere("lead.created_at <= :end", { end });
  applyDailyReportLeadScope(query, user);
  return query.getCount();
}

/**
 * Contacted in range = at least one call log in range, OR moved out of default "new" status
 * during the range (updated_at proxy — no status-history table exists).
 */
async function getLeadsContacted(
  user: AuthUser,
  start: Date,
  end: Date
): Promise<{ total: number; by_stage: StageBreakdownRow[] }> {
  const contactedSubquery = callRepository()
    .createQueryBuilder("contact_call")
    .select("DISTINCT contact_call.lead_id")
    .where("contact_call.lead_id IS NOT NULL")
    .andWhere("contact_call.created_at >= :start")
    .andWhere("contact_call.created_at <= :end");

  applyDailyReportCallScope(contactedSubquery, user, "contact_call");

  const query = leadRepository()
    .createQueryBuilder("lead")
    .select("lead.status", "status")
    .addSelect("COUNT(*)", "count")
    .where(
      `(
        lead.id IN (${contactedSubquery.getQuery()})
        OR (
          lead.status != :newStatus
          AND lead.updated_at >= :start
          AND lead.updated_at <= :end
        )
      )`
    )
    .setParameters({ ...contactedSubquery.getParameters(), newStatus: LeadStatus.NEW, start, end })
    .groupBy("lead.status");

  applyDailyReportLeadScope(query, user);

  const rows = await query.getRawMany();
  const byStage = emptyStageBreakdown();
  let total = 0;

  for (const row of rows) {
    const count = parseInt(row.count || "0", 10);
    total += count;
    const stage = byStage.find((s) => s.status === row.status);
    if (stage) {
      stage.count = count;
    }
  }

  return { total, by_stage: byStage };
}

async function getCallsByAgent(user: AuthUser, start: Date, end: Date): Promise<AgentCallCountRow[]> {
  const query = callRepository()
    .createQueryBuilder("call")
    .select("call.user_id", "agent_id")
    .addSelect("call.user_name", "agent_name")
    .addSelect("COUNT(*)", "call_count")
    .where("call.created_at >= :start", { start })
    .andWhere("call.created_at <= :end", { end })
    .andWhere("call.user_id IS NOT NULL")
    .groupBy("call.user_id")
    .addGroupBy("call.user_name")
    .orderBy("call_count", "DESC");

  applyDailyReportCallScope(query, user);

  const rows = await query.getRawMany();
  return rows.map((row) => ({
    agent_id: row.agent_id,
    agent_name: row.agent_name || "Unknown",
    call_count: parseInt(row.call_count || "0", 10),
  }));
}

async function getCallTimeByAgent(user: AuthUser, start: Date, end: Date): Promise<AgentCallTimeRow[]> {
  const query = callRepository()
    .createQueryBuilder("call")
    .select("call.user_id", "agent_id")
    .addSelect("call.user_name", "agent_name")
    .addSelect("COALESCE(SUM(call.duration_minutes), 0)", "total_duration_minutes")
    .where("call.created_at >= :start", { start })
    .andWhere("call.created_at <= :end", { end })
    .andWhere("call.user_id IS NOT NULL")
    .groupBy("call.user_id")
    .addGroupBy("call.user_name")
    .orderBy("total_duration_minutes", "DESC");

  applyDailyReportCallScope(query, user);

  const rows = await query.getRawMany();
  return rows.map((row) => {
    const totalDurationMinutes = parseInt(row.total_duration_minutes || "0", 10);
    return {
      agent_id: row.agent_id,
      agent_name: row.agent_name || "Unknown",
      total_duration_minutes: totalDurationMinutes,
      total_duration_seconds: totalDurationMinutes * 60,
    };
  });
}

export async function getDailyActivityReport(
  user: AuthUser,
  rangeInput: DailyActivityRange,
  now = new Date()
): Promise<DailyActivityReportResult> {
  const parsed = parseDailyActivityRange(rangeInput, now);
  if (!parsed) {
    throw new Error("Invalid range");
  }

  const { range, start, end, label } = parsed;

  const [totalLeadsGenerated, leadsContacted, callsByAgent, callTimeByAgent] = await Promise.all([
    countLeadsGenerated(user, start, end),
    getLeadsContacted(user, start, end),
    getCallsByAgent(user, start, end),
    getCallTimeByAgent(user, start, end),
  ]);

  return {
    range,
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    range_label: label,
    view_scope: isDailyReportAdmin(user) ? "all" : "self",
    total_leads_generated: totalLeadsGenerated,
    leads_contacted: leadsContacted,
    calls_by_agent: callsByAgent,
    call_time_available: true,
    call_time_by_agent: callTimeByAgent,
  };
}
