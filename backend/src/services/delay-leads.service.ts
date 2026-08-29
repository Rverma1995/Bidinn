import { AppDataSource } from "../config/data-source";
import { Lead } from "../entities";
import {
  DelayLeadInput,
  IDLE_EXCLUDE_STATUSES,
  OVERDUE_EXCLUDE_STATUSES,
  idleSinceDate,
} from "./report-metrics";

const leadRepository = () => AppDataSource.getRepository(Lead);

/** Same shape as GET /dashboard/overdue-followups (all past-due, not the 24h notification window). */
export function overdueFollowupsQuery(now = new Date()) {
  return leadRepository()
    .createQueryBuilder("lead")
    .where("lead.next_followup < :now", { now })
    .andWhere("lead.next_followup IS NOT NULL")
    .andWhere("lead.status NOT IN (:...overdueStatuses)", { overdueStatuses: OVERDUE_EXCLUDE_STATUSES })
    .orderBy("lead.next_followup", "ASC");
}

/** Follow-ups due in the next 24 hours — dashboard upcoming list (assigned leads only). */
export function upcomingFollowupsQuery(now = new Date(), windowMs = 24 * 60 * 60 * 1000) {
  const soon = new Date(now.getTime() + windowMs);
  return leadRepository()
    .createQueryBuilder("lead")
    .where("lead.next_followup > :now", { now })
    .andWhere("lead.next_followup <= :soon", { soon })
    .andWhere("lead.next_followup IS NOT NULL")
    .andWhere("lead.assigned_to IS NOT NULL")
    .andWhere("lead.status NOT IN (:...upcomingStatuses)", { upcomingStatuses: OVERDUE_EXCLUDE_STATUSES })
    .orderBy("lead.next_followup", "ASC");
}

/** Same shape as the idle_lead escalation job (5+ days, active statuses). */
export function idleLeadsQuery(now = new Date()) {
  const fiveDaysAgo = idleSinceDate(now);
  return leadRepository()
    .createQueryBuilder("lead")
    .where("lead.status NOT IN (:...idleStatuses)", { idleStatuses: IDLE_EXCLUDE_STATUSES })
    .andWhere("(lead.last_activity < :fiveDaysAgo OR lead.last_activity IS NULL)", { fiveDaysAgo })
    .andWhere("lead.created_at < :fiveDaysAgo", { fiveDaysAgo });
}

export async function fetchOverdueFollowupLeads(now = new Date()): Promise<DelayLeadInput[]> {
  return overdueFollowupsQuery(now).getMany();
}

export async function fetchIdleLeads(now = new Date()): Promise<DelayLeadInput[]> {
  return idleLeadsQuery(now).getMany();
}

/**
 * Average minutes from lead.created_at to the first logged call, per assigned agent.
 * Cheap from existing timestamps — no new instrumentation.
 */
export async function fetchAgentAvgFirstCallMinutes(): Promise<Map<string, number>> {
  try {
    const rows: Array<{ agent_id: string; avg_minutes: string | number | null }> = await AppDataSource.query(
      `SELECT lead.assigned_to AS agent_id,
              AVG(TIMESTAMPDIFF(MINUTE, lead.created_at, first_call.first_at)) AS avg_minutes
       FROM leads lead
       INNER JOIN (
         SELECT lead_id, MIN(created_at) AS first_at
         FROM calls
         WHERE lead_id IS NOT NULL
         GROUP BY lead_id
       ) first_call ON first_call.lead_id = lead.id
       WHERE lead.assigned_to IS NOT NULL
       GROUP BY lead.assigned_to`
    );

    const map = new Map<string, number>();
    for (const row of rows) {
      if (!row.agent_id || row.avg_minutes == null) continue;
      const minutes = parseFloat(String(row.avg_minutes));
      if (!Number.isNaN(minutes)) map.set(row.agent_id, minutes);
    }
    return map;
  } catch (error) {
    console.error("Avg first-call query failed; delay report will omit that column:", error);
    return new Map();
  }
}

export interface DelaySnapshot {
  now: Date;
  overdue: DelayLeadInput[];
  idle: DelayLeadInput[];
  avgFirstCallMinutes: Map<string, number>;
}

export async function fetchDelaySnapshot(now = new Date()): Promise<DelaySnapshot> {
  const [overdue, idle, avgFirstCallMinutes] = await Promise.all([
    fetchOverdueFollowupLeads(now),
    fetchIdleLeads(now),
    fetchAgentAvgFirstCallMinutes(),
  ]);
  return { now, overdue, idle, avgFirstCallMinutes };
}
