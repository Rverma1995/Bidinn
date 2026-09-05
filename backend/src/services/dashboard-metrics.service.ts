import { AppDataSource } from "../config/data-source";
import { Lead, Booking, PaymentStatus } from "../entities";
import { applySalesRepLeadScope, startOfCalendarMonth } from "../utils/lead-scope";
import { AuthUser } from "../types";

const leadRepository = () => AppDataSource.getRepository(Lead);
const bookingRepository = () => AppDataSource.getRepository(Booking);

export const PAID_BOOKING_STATUSES = [PaymentStatus.PAID, PaymentStatus.PARTIAL];

export function applyRevenueScope(
  queryBuilder: ReturnType<ReturnType<typeof bookingRepository>["createQueryBuilder"]>,
  user: AuthUser
) {
  queryBuilder.innerJoin("booking.lead", "lead");
  return applySalesRepLeadScope(queryBuilder, user, "lead");
}

export interface DashboardStatsResult {
  total_leads: number;
  new_leads: number;
  monthly_new_leads: number;
  closed_won: number;
  closed_lost: number;
  monthly_closed_won: number;
  monthly_closed_lost: number;
  overdue_followups: number;
  upcoming_followups: number;
  uncontacted_over_1hr: number;
  needs_immediate_attention: number;
  total_revenue: number;
  monthly_revenue: number;
  conversion_rate: number;
  avg_deal_size: number;
  reporting_period: "calendar_month";
}

export interface PeriodSummary {
  start: Date;
  end: Date | null;
  new_leads: number;
  closed_won: number;
  closed_lost: number;
  revenue: number;
  conversion_rate: number;
  new_leads_by_source: { source: string; count: number }[];
}

function periodPredicate(column: string, end?: Date): string {
  return end
    ? `lead.${column} >= :periodStart AND lead.${column} < :periodEnd`
    : `lead.${column} >= :periodStart`;
}

function bookingPeriodPredicate(end?: Date): string {
  return end
    ? "booking.created_at >= :periodStart AND booking.created_at < :periodEnd"
    : "booking.created_at >= :periodStart";
}

/**
 * Org-wide period totals. Same definitions as GET /dashboard/stats monthly_* fields
 * (won/lost via current status + updated_at; revenue via paid/partial booking.created_at).
 * Pass `end` for a completed window; omit it to match dashboard (open-ended from start).
 */
export async function getPeriodSummary(start: Date, end?: Date): Promise<PeriodSummary> {
  const createdPred = periodPredicate("created_at", end);
  const updatedPred = periodPredicate("updated_at", end);
  const params = end ? { periodStart: start, periodEnd: end } : { periodStart: start };

  const leadRow = await leadRepository()
    .createQueryBuilder("lead")
    .select(`SUM(CASE WHEN ${createdPred} THEN 1 ELSE 0 END)`, "new_leads")
    .addSelect(
      `SUM(CASE WHEN lead.status = 'won' AND ${updatedPred} THEN 1 ELSE 0 END)`,
      "closed_won"
    )
    .addSelect(
      `SUM(CASE WHEN lead.status = 'lost' AND ${updatedPred} THEN 1 ELSE 0 END)`,
      "closed_lost"
    )
    .setParameters(params)
    .getRawOne();

  const revenueRow = await bookingRepository()
    .createQueryBuilder("booking")
    .select("SUM(booking.payment_amount)", "total")
    .where("booking.payment_status IN (:...paidStatuses)", { paidStatuses: PAID_BOOKING_STATUSES })
    .andWhere(bookingPeriodPredicate(end))
    .setParameters(params)
    .getRawOne();

  const sourceQuery = leadRepository()
    .createQueryBuilder("lead")
    .select("COALESCE(NULLIF(TRIM(lead.source), ''), 'Unknown')", "source")
    .addSelect("COUNT(*)", "count")
    .where(createdPred)
    .setParameters(params)
    .groupBy("source")
    .orderBy("count", "DESC");

  const sourceRows = await sourceQuery.getRawMany();

  const newLeads = parseInt(leadRow?.new_leads || "0", 10);
  const closedWon = parseInt(leadRow?.closed_won || "0", 10);
  const closedLost = parseInt(leadRow?.closed_lost || "0", 10);
  const processed = closedWon + closedLost;

  return {
    start,
    end: end || null,
    new_leads: newLeads,
    closed_won: closedWon,
    closed_lost: closedLost,
    revenue: parseFloat(revenueRow?.total || "0"),
    conversion_rate: processed > 0 ? Math.round((closedWon / processed) * 100) : 0,
    new_leads_by_source: sourceRows.map((r: { source: string; count: string }) => ({
      source: r.source,
      count: parseInt(r.count || "0", 10),
    })),
  };
}

/**
 * Metric definitions (calendar month, server local timezone):
 * - needs_immediate_attention: uncontacted_over_1hr + overdue_followups
 * - overdue_followups: next_followup < now, not won/lost
 * - upcoming_followups: next_followup in the next 24 hours, assigned, not won/lost
 * - closed_won / closed_lost: current status (all-time)
 * - uncontacted_over_1hr: status=new AND attempt_count=0 AND created_at < now-1h
 * - monthly_closed_won/lost: status in (won,lost) AND updated_at >= start of month
 *   (no closed_at column — updated_at is the close-time proxy)
 */
export async function getDashboardStats(user: AuthUser, now = new Date()): Promise<DashboardStatsResult> {
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const startOfMonth = startOfCalendarMonth(now);

  const leadStatsQuery = leadRepository()
    .createQueryBuilder("lead")
    .select("COUNT(*)", "total_leads")
    .addSelect("SUM(CASE WHEN lead.status = 'new' THEN 1 ELSE 0 END)", "new_leads")
    .addSelect("SUM(CASE WHEN lead.status = 'won' THEN 1 ELSE 0 END)", "closed_won")
    .addSelect("SUM(CASE WHEN lead.status = 'lost' THEN 1 ELSE 0 END)", "closed_lost")
    .addSelect(
      "SUM(CASE WHEN lead.next_followup IS NOT NULL AND lead.next_followup < :now AND lead.status NOT IN ('won', 'lost') THEN 1 ELSE 0 END)",
      "overdue_followups"
    )
    .addSelect(
      "SUM(CASE WHEN lead.next_followup IS NOT NULL AND lead.next_followup > :now AND lead.next_followup <= :soon AND lead.assigned_to IS NOT NULL AND lead.status NOT IN ('won', 'lost') THEN 1 ELSE 0 END)",
      "upcoming_followups"
    )
    .addSelect(
      "SUM(CASE WHEN lead.status = 'new' AND lead.attempt_count = 0 AND lead.created_at < :oneHourAgo THEN 1 ELSE 0 END)",
      "uncontacted_over_1hr"
    )
    .addSelect(
      "SUM(CASE WHEN lead.status = 'won' AND lead.updated_at >= :startOfMonth THEN 1 ELSE 0 END)",
      "monthly_closed_won"
    )
    .addSelect(
      "SUM(CASE WHEN lead.status = 'lost' AND lead.updated_at >= :startOfMonth THEN 1 ELSE 0 END)",
      "monthly_closed_lost"
    )
    .addSelect(
      "SUM(CASE WHEN lead.created_at >= :startOfMonth THEN 1 ELSE 0 END)",
      "monthly_new_leads"
    )
    .setParameters({ now, soon, oneHourAgo, startOfMonth });

  applySalesRepLeadScope(leadStatsQuery, user);
  const leadRow = await leadStatsQuery.getRawOne();

  const revenueQuery = bookingRepository()
    .createQueryBuilder("booking")
    .select("SUM(booking.payment_amount)", "total")
    .addSelect(
      "SUM(CASE WHEN booking.created_at >= :startOfMonth THEN booking.payment_amount ELSE 0 END)",
      "monthly"
    )
    .addSelect(
      "AVG(CASE WHEN booking.payment_status = 'paid' THEN booking.final_price ELSE NULL END)",
      "avg_deal"
    )
    .where("booking.payment_status IN (:...paidStatuses)", { paidStatuses: PAID_BOOKING_STATUSES })
    .setParameter("startOfMonth", startOfMonth);

  applyRevenueScope(revenueQuery, user);
  const revenueRow = await revenueQuery.getRawOne();

  const closedWon = parseInt(leadRow?.closed_won || "0", 10);
  const closedLost = parseInt(leadRow?.closed_lost || "0", 10);
  const overdueFollowups = parseInt(leadRow?.overdue_followups || "0", 10);
  const upcomingFollowups = parseInt(leadRow?.upcoming_followups || "0", 10);
  const uncontactedOver1hr = parseInt(leadRow?.uncontacted_over_1hr || "0", 10);
  const processedLeads = closedWon + closedLost;
  const conversionRate = processedLeads > 0 ? Math.round((closedWon / processedLeads) * 100) : 0;

  return {
    total_leads: parseInt(leadRow?.total_leads || "0", 10),
    new_leads: parseInt(leadRow?.new_leads || "0", 10),
    monthly_new_leads: parseInt(leadRow?.monthly_new_leads || "0", 10),
    closed_won: closedWon,
    closed_lost: closedLost,
    monthly_closed_won: parseInt(leadRow?.monthly_closed_won || "0", 10),
    monthly_closed_lost: parseInt(leadRow?.monthly_closed_lost || "0", 10),
    overdue_followups: overdueFollowups,
    upcoming_followups: upcomingFollowups,
    uncontacted_over_1hr: uncontactedOver1hr,
    needs_immediate_attention: uncontactedOver1hr + overdueFollowups,
    total_revenue: parseFloat(revenueRow?.total || "0"),
    monthly_revenue: parseFloat(revenueRow?.monthly || "0"),
    conversion_rate: conversionRate,
    avg_deal_size: parseFloat(revenueRow?.avg_deal || "0"),
    reporting_period: "calendar_month",
  };
}
