import { Router, Response } from "express";
import { cacheMiddleware } from "../middleware/cache";
import { CACHE_KEYS, CACHE_TTL } from "../config/cache.constants";
import { AppDataSource } from "../config/data-source";
import { Lead, LeadStatus, Booking, PaymentStatus, Call, User, UserRole } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { In } from "typeorm";
import { applySalesRepLeadScope } from "../utils/lead-scope";
import { AuthUser } from "../types";
import { getDashboardStats } from "../services/dashboard-metrics.service";
import { getAgentPerformance } from "../services/agent-performance.service";
import { overdueFollowupsQuery, upcomingFollowupsQuery } from "../services/delay-leads.service";

const router = Router();
const leadRepository = () => AppDataSource.getRepository(Lead);
const bookingRepository = () => AppDataSource.getRepository(Booking);
const callRepository = () => AppDataSource.getRepository(Call);
const userRepository = () => AppDataSource.getRepository(User);

const paidStatuses = [PaymentStatus.PAID, PaymentStatus.PARTIAL];

function applyRevenueScope(queryBuilder: ReturnType<ReturnType<typeof bookingRepository>["createQueryBuilder"]>, user: AuthUser) {
  queryBuilder.innerJoin("booking.lead", "lead");
  return applySalesRepLeadScope(queryBuilder, user, "lead");
}

/**
 * Metric definitions (calendar month, server local timezone):
 * - needs_immediate_attention: uncontacted_over_1hr + overdue_followups
 * - overdue_followups: next_followup < now, not won/lost
 * - closed_won / closed_lost: current status (all-time)
 * - uncontacted_over_1hr: status=new AND attempt_count=0 AND created_at < now-1h
 *   (no first_contact column — attempt_count is the contact proxy)
 * - monthly_closed_won/lost: status in (won,lost) AND updated_at >= start of month
 *   (no closed_at column — updated_at is the close-time proxy)
 */
router.get("/stats", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.TIME_SENSITIVE), async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getDashboardStats(req.user!));
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get leaderboard
router.get("/leaderboard", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const users = await userRepository().find({
      where: { role: In([UserRole.SALES_REP, UserRole.TEAM_LEAD]) },
    });

    const leaderboard = await Promise.all(
      users.map(async (user) => {
        const wonLeads = await leadRepository().count({
          where: { assigned_to: user.id, status: LeadStatus.WON },
        });

        const lostLeads = await leadRepository().count({
          where: { assigned_to: user.id, status: LeadStatus.LOST },
        });

        const totalCalls = await callRepository().count({
          where: { user_id: user.id },
        });

        const revenueResult = await bookingRepository()
          .createQueryBuilder("booking")
          .select("SUM(booking.payment_amount)", "total")
          .where("booking.created_by_id = :userId", { userId: user.id })
          .andWhere("booking.payment_status IN (:...statuses)", { statuses: [PaymentStatus.PAID, PaymentStatus.PARTIAL] })
          .getRawOne();

        // Calculate conversion rate
        const totalProcessed = wonLeads + lostLeads;
        const conversionRate = totalProcessed > 0 ? (wonLeads / totalProcessed) * 100 : 0;

        return {
          user_id: user.id,
          user_name: user.name,
          role: user.role,
          leads_closed: wonLeads,
          calls_made: totalCalls,
          revenue: parseFloat(revenueResult?.total || "0"),
          conversion_rate: conversionRate,
        };
      })
    );

    // Sort by revenue descending
    leaderboard.sort((a, b) => b.revenue - a.revenue);

    res.json(leaderboard);
  } catch (error) {
    console.error("Get leaderboard error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get recent activities
router.get("/activities", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const activities = await AppDataSource.getRepository("Activity").find({
      order: { created_at: "DESC" },
      take: 20,
    });
    res.json(activities);
  } catch (error) {
    console.error("Get activities error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

async function getPipelineCounts(user: AuthRequest["user"]) {
  const statuses = Object.values(LeadStatus);
  const pipeline: Record<string, number> = {};
  statuses.forEach((s) => { pipeline[s] = 0; });

  const query = leadRepository()
    .createQueryBuilder("lead")
    .select("lead.status", "status")
    .addSelect("COUNT(*)", "count")
    .groupBy("lead.status");
  applySalesRepLeadScope(query, user!);

  const rows = await query.getRawMany();
  for (const row of rows) {
    pipeline[row.status] = parseInt(row.count || "0", 10);
  }
  return pipeline;
}

// Get pipeline stats
router.get("/pipeline", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.TIME_SENSITIVE), async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getPipelineCounts(req.user));
  } catch (error) {
    console.error("Get pipeline error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get pipeline stats (alternate endpoint)
router.get("/pipeline-stats", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.TIME_SENSITIVE), async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getPipelineCounts(req.user));
  } catch (error) {
    console.error("Get pipeline-stats error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get overdue followups
router.get("/overdue-followups", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.TIME_SENSITIVE), async (req: AuthRequest, res: Response) => {
  try {
    const query = overdueFollowupsQuery();
    applySalesRepLeadScope(query, req.user!);
    const leads = await query.getMany();

    res.json(leads);
  } catch (error) {
    console.error("Get overdue-followups error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get upcoming followups (due in the next 24 hours)
router.get("/upcoming-followups", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.TIME_SENSITIVE), async (req: AuthRequest, res: Response) => {
  try {
    const query = upcomingFollowupsQuery();
    applySalesRepLeadScope(query, req.user!);
    const leads = await query.getMany();

    res.json(leads);
  } catch (error) {
    console.error("Get upcoming-followups error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get agent performance
router.get("/agent-performance", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    let { agent_id, start_date, end_date } = req.query;
    if (req.user!.role === UserRole.SALES_REP) {
      agent_id = req.user!.id;
    }

    const result = await getAgentPerformance({
      agentId: typeof agent_id === "string" ? agent_id : undefined,
      startDate: start_date ? new Date(start_date as string) : undefined,
      endDate: end_date ? new Date(end_date as string) : undefined,
    });
    res.json(result);
  } catch (error) {
    console.error("Get agent-performance error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get revenue trend
router.get("/revenue-trend", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const query = bookingRepository()
      .createQueryBuilder("booking")
      .select("DATE(booking.created_at)", "date")
      .addSelect("SUM(booking.payment_amount)", "revenue")
      .where("booking.created_at >= :start", { start: thirtyDaysAgo })
      .andWhere("booking.payment_status IN (:...statuses)", { statuses: paidStatuses })
      .groupBy("DATE(booking.created_at)")
      .orderBy("date", "ASC");

    applyRevenueScope(query, req.user!);
    const result = await query.getRawMany();

    res.json(result.map(r => ({ date: r.date, month: r.date, revenue: parseFloat(r.revenue || "0") })));
  } catch (error) {
    console.error("Get revenue-trend error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

function mapChannelRow(r: { source?: string; campaign?: string; total: string; won: string }) {
  const total = parseInt(r.total || "0", 10);
  const won = parseInt(r.won || "0", 10);
  const conversionRate = total > 0 ? Math.round((won / total) * 1000) / 10 : 0;
  return {
    source: r.source,
    campaign: r.campaign,
    total,
    total_leads: total,
    won,
    closed_won: won,
    conversion_rate: conversionRate,
  };
}

// Get source performance
router.get("/source-performance", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const query = leadRepository()
      .createQueryBuilder("lead")
      .select("lead.source", "source")
      .addSelect("COUNT(*)", "total")
      .addSelect("SUM(CASE WHEN lead.status = 'won' THEN 1 ELSE 0 END)", "won")
      .groupBy("lead.source");
    applySalesRepLeadScope(query, req.user!);

    const result = await query.getRawMany();
    res.json(result.map(mapChannelRow));
  } catch (error) {
    console.error("Get source-performance error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

/**
 * Campaign performance. Cost/spend is not stored anywhere in this CRM,
 * so ROI cannot be computed. campaign_cost_available is always false.
 */
router.get("/campaign-performance", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const query = leadRepository()
      .createQueryBuilder("lead")
      .select("lead.campaign", "campaign")
      .addSelect("COUNT(*)", "total")
      .addSelect("SUM(CASE WHEN lead.status = 'won' THEN 1 ELSE 0 END)", "won")
      .where("lead.campaign IS NOT NULL")
      .andWhere("lead.campaign != ''")
      .groupBy("lead.campaign")
      .orderBy("COUNT(*)", "DESC");
    applySalesRepLeadScope(query, req.user!);

    const result = await query.getRawMany();
    res.json({
      campaign_cost_available: false,
      roi_available: false,
      message: "Campaign cost/spend is not tracked yet, so ROI (revenue vs cost) cannot be computed. Add a campaign cost field before enabling ROI.",
      campaigns: result.map(mapChannelRow),
    });
  } catch (error) {
    console.error("Get campaign-performance error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get daily lead counts for a date range
router.get("/lead-counts", authenticateToken, cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const { start_date, end_date, group_by } = req.query;
    
    // Default to last 30 days if no dates provided
    const endDate = end_date ? new Date(end_date as string) : new Date();
    const startDate = start_date ? new Date(start_date as string) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Determine grouping format based on group_by parameter
    let dateFormat = '%Y-%m-%d'; // daily by default
    let groupLabel = 'day';
    
    if (group_by === 'weekly') {
      dateFormat = '%Y-%u'; // Year-Week number
      groupLabel = 'week';
    } else if (group_by === 'monthly') {
      dateFormat = '%Y-%m';
      groupLabel = 'month';
    } else if (group_by === 'yearly') {
      dateFormat = '%Y';
      groupLabel = 'year';
    }
    
    const countsQuery = leadRepository()
      .createQueryBuilder("lead")
      .select(`DATE_FORMAT(lead.created_at, '${dateFormat}')`, "period")
      .addSelect("COUNT(*)", "count")
      .addSelect("SUM(CASE WHEN lead.status = 'won' THEN 1 ELSE 0 END)", "won")
      .addSelect("SUM(CASE WHEN lead.status = 'lost' THEN 1 ELSE 0 END)", "lost")
      .addSelect("SUM(CASE WHEN lead.status = 'interested' THEN 1 ELSE 0 END)", "interested")
      .addSelect("SUM(CASE WHEN lead.status = 'new' THEN 1 ELSE 0 END)", "new_status")
      .where("lead.created_at >= :startDate", { startDate })
      .andWhere("lead.created_at <= :endDate", { endDate })
      .groupBy("period")
      .orderBy("period", "ASC");
    applySalesRepLeadScope(countsQuery, req.user!);
    const results = await countsQuery.getRawMany();
    
    // Format results with proper date labels
    const formattedResults = results.map(r => {
      let label = r.period;
      
      if (group_by === 'weekly') {
        const [year, week] = r.period.split('-');
        label = `Week ${week}, ${year}`;
      } else if (group_by === 'monthly') {
        const [year, month] = r.period.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        label = `${monthNames[parseInt(month) - 1]} ${year}`;
      } else if (group_by === 'yearly') {
        label = r.period;
      } else {
        // Daily - format as readable date
        const date = new Date(r.period);
        label = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      }
      
      return {
        period: r.period,
        label,
        count: parseInt(r.count),
        won: parseInt(r.won || 0),
        lost: parseInt(r.lost || 0),
        interested: parseInt(r.interested || 0),
        new_status: parseInt(r.new_status || 0),
      };
    });
    
    // Calculate totals
    const totals = formattedResults.reduce((acc, r) => ({
      total_leads: acc.total_leads + r.count,
      total_won: acc.total_won + r.won,
      total_lost: acc.total_lost + r.lost,
      total_interested: acc.total_interested + r.interested,
    }), { total_leads: 0, total_won: 0, total_lost: 0, total_interested: 0 });
    
    res.json({
      group_by: group_by || 'daily',
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      data: formattedResults,
      totals,
    });
  } catch (error) {
    console.error("Get lead-counts error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
