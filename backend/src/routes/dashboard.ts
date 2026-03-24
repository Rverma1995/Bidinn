import { Router, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Lead, LeadStatus, Booking, PaymentStatus, Call, User, UserRole } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { Between, In, IsNull, LessThan, Not } from "typeorm";

const router = Router();
const leadRepository = () => AppDataSource.getRepository(Lead);
const bookingRepository = () => AppDataSource.getRepository(Booking);
const callRepository = () => AppDataSource.getRepository(Call);
const userRepository = () => AppDataSource.getRepository(User);

// Get dashboard stats
router.get("/stats", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Base query conditions based on role
    const isSalesRep = user.role === UserRole.SALES_REP;

    // Total leads
    let totalLeadsQuery = leadRepository().createQueryBuilder("lead");
    if (isSalesRep) {
      totalLeadsQuery = totalLeadsQuery.where("lead.assigned_to = :userId", { userId: user.id });
    }
    const totalLeads = await totalLeadsQuery.getCount();

    // New leads
    let newLeadsQuery = leadRepository().createQueryBuilder("lead").where("lead.status = :status", { status: LeadStatus.NEW });
    if (isSalesRep) {
      newLeadsQuery = newLeadsQuery.andWhere("lead.assigned_to = :userId", { userId: user.id });
    }
    const newLeads = await newLeadsQuery.getCount();

    // Won leads
    let wonLeadsQuery = leadRepository().createQueryBuilder("lead").where("lead.status = :status", { status: LeadStatus.WON });
    if (isSalesRep) {
      wonLeadsQuery = wonLeadsQuery.andWhere("lead.assigned_to = :userId", { userId: user.id });
    }
    const closedWon = await wonLeadsQuery.getCount();

    // Lost leads
    let lostLeadsQuery = leadRepository().createQueryBuilder("lead").where("lead.status = :status", { status: LeadStatus.LOST });
    if (isSalesRep) {
      lostLeadsQuery = lostLeadsQuery.andWhere("lead.assigned_to = :userId", { userId: user.id });
    }
    const closedLost = await lostLeadsQuery.getCount();

    // Overdue follow-ups
    let overdueQuery = leadRepository()
      .createQueryBuilder("lead")
      .where("lead.next_followup < :now", { now })
      .andWhere("lead.next_followup IS NOT NULL")
      .andWhere("lead.status NOT IN (:...statuses)", { statuses: [LeadStatus.WON, LeadStatus.LOST] });
    if (isSalesRep) {
      overdueQuery = overdueQuery.andWhere("lead.assigned_to = :userId", { userId: user.id });
    }
    const overdueFollowups = await overdueQuery.getCount();

    // Uncontacted over 1 hour
    let uncontactedQuery = leadRepository()
      .createQueryBuilder("lead")
      .where("lead.status = :status", { status: LeadStatus.NEW })
      .andWhere("lead.attempt_count = 0")
      .andWhere("lead.created_at < :oneHourAgo", { oneHourAgo });
    if (isSalesRep) {
      uncontactedQuery = uncontactedQuery.andWhere("lead.assigned_to = :userId", { userId: user.id });
    }
    const uncontactedOver1hr = await uncontactedQuery.getCount();

    // Total revenue (from paid bookings)
    const revenueResult = await bookingRepository()
      .createQueryBuilder("booking")
      .select("SUM(booking.payment_amount)", "total")
      .where("booking.payment_status IN (:...statuses)", { statuses: [PaymentStatus.PAID, PaymentStatus.PARTIAL] })
      .getRawOne();
    const totalRevenue = parseFloat(revenueResult?.total || "0");

    // Monthly revenue
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyRevenueResult = await bookingRepository()
      .createQueryBuilder("booking")
      .select("SUM(booking.payment_amount)", "total")
      .where("booking.payment_status IN (:...statuses)", { statuses: [PaymentStatus.PAID, PaymentStatus.PARTIAL] })
      .andWhere("booking.created_at >= :startOfMonth", { startOfMonth })
      .getRawOne();
    const monthlyRevenue = parseFloat(monthlyRevenueResult?.total || "0");

    // Conversion rate
    const convertedLeads = closedWon;
    const processedLeads = closedWon + closedLost;
    const conversionRate = processedLeads > 0 ? Math.round((convertedLeads / processedLeads) * 100) : 0;

    // Average deal size
    const avgDealResult = await bookingRepository()
      .createQueryBuilder("booking")
      .select("AVG(booking.final_price)", "avg")
      .where("booking.payment_status = :status", { status: PaymentStatus.PAID })
      .getRawOne();
    const avgDealSize = parseFloat(avgDealResult?.avg || "0");

    res.json({
      total_leads: totalLeads,
      new_leads: newLeads,
      closed_won: closedWon,
      closed_lost: closedLost,
      overdue_followups: overdueFollowups,
      uncontacted_over_1hr: uncontactedOver1hr,
      total_revenue: totalRevenue,
      monthly_revenue: monthlyRevenue,
      conversion_rate: conversionRate,
      avg_deal_size: avgDealSize,
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get leaderboard
router.get("/leaderboard", authenticateToken, async (req: AuthRequest, res: Response) => {
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
router.get("/activities", authenticateToken, async (req: AuthRequest, res: Response) => {
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

// Get pipeline stats
router.get("/pipeline", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const statuses = Object.values(LeadStatus);
    const pipeline: Record<string, number> = {};

    for (const status of statuses) {
      pipeline[status] = await leadRepository().count({ where: { status } });
    }

    res.json(pipeline);
  } catch (error) {
    console.error("Get pipeline error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get pipeline stats (alternate endpoint)
router.get("/pipeline-stats", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const statuses = Object.values(LeadStatus);
    const pipeline: Record<string, number> = {};

    for (const status of statuses) {
      pipeline[status] = await leadRepository().count({ where: { status } });
    }

    res.json(pipeline);
  } catch (error) {
    console.error("Get pipeline-stats error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get overdue followups
router.get("/overdue-followups", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const leads = await leadRepository()
      .createQueryBuilder("lead")
      .where("lead.next_followup < :now", { now })
      .andWhere("lead.next_followup IS NOT NULL")
      .andWhere("lead.status NOT IN (:...statuses)", { statuses: [LeadStatus.WON, LeadStatus.LOST] })
      .orderBy("lead.next_followup", "ASC")
      .getMany();

    res.json(leads);
  } catch (error) {
    console.error("Get overdue-followups error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get agent performance
router.get("/agent-performance", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { agent_id, start_date, end_date } = req.query;

    // Get all sales reps, team leads, and managers for the dropdown
    const allAgents = await userRepository().find({
      where: { role: In([UserRole.SALES_REP, UserRole.TEAM_LEAD, UserRole.MANAGER]) },
    });

    // Get admin users to identify "system" leads
    const adminUsers = await userRepository().find({
      where: { role: UserRole.ADMIN },
    });
    const adminIds = adminUsers.map(a => a.id);

    // If specific agent is selected, filter to that agent only
    const usersToProcess = agent_id && agent_id !== 'all' && agent_id !== 'system'
      ? allAgents.filter(u => u.id === agent_id)
      : allAgents;

    const agents = await Promise.all(
      usersToProcess.map(async (user) => {
        // Build base query for leads assigned to this user
        let leadsQuery = leadRepository().createQueryBuilder("lead").where("lead.assigned_to = :userId", { userId: user.id });
        
        // Apply date filters to leads
        if (start_date) {
          leadsQuery = leadsQuery.andWhere("lead.created_at >= :start", { start: new Date(start_date as string) });
        }
        if (end_date) {
          leadsQuery = leadsQuery.andWhere("lead.created_at <= :end", { end: new Date(end_date as string) });
        }

        const totalLeads = await leadsQuery.getCount();
        
        // Contacted = any status except 'new'
        const contacted = await leadsQuery.clone()
          .andWhere("lead.status != :newStatus", { newStatus: LeadStatus.NEW })
          .getCount();
        
        const notContacted = totalLeads - contacted;
        
        // Converted = won status
        const converted = await leadsQuery.clone()
          .andWhere("lead.status = :wonStatus", { wonStatus: LeadStatus.WON })
          .getCount();

        // Get counts for all lead stages
        const stageNew = await leadsQuery.clone()
          .andWhere("lead.status = :status", { status: LeadStatus.NEW })
          .getCount();
        const stageNotAnswered = await leadsQuery.clone()
          .andWhere("lead.status = :status", { status: LeadStatus.NOT_ANSWERED })
          .getCount();
        const stageInterested = await leadsQuery.clone()
          .andWhere("lead.status = :status", { status: LeadStatus.INTERESTED })
          .getCount();
        const stageFollowup = await leadsQuery.clone()
          .andWhere("lead.status = :status", { status: LeadStatus.FOLLOWUP })
          .getCount();
        const stageWon = converted;
        const stageLost = await leadsQuery.clone()
          .andWhere("lead.status = :status", { status: LeadStatus.LOST })
          .getCount();
        const stageNotInterested = await leadsQuery.clone()
          .andWhere("lead.status = :status", { status: LeadStatus.NOT_INTERESTED })
          .getCount();

        // Get calls made
        let callsQuery = callRepository().createQueryBuilder("call").where("call.user_id = :userId", { userId: user.id });
        if (start_date) {
          callsQuery = callsQuery.andWhere("call.created_at >= :start", { start: new Date(start_date as string) });
        }
        if (end_date) {
          callsQuery = callsQuery.andWhere("call.created_at <= :end", { end: new Date(end_date as string) });
        }
        const callsMade = await callsQuery.getCount();

        // Get revenue from bookings
        let bookingsQuery = bookingRepository().createQueryBuilder("booking").where("booking.created_by_id = :userId", { userId: user.id });
        if (start_date) {
          bookingsQuery = bookingsQuery.andWhere("booking.created_at >= :start", { start: new Date(start_date as string) });
        }
        if (end_date) {
          bookingsQuery = bookingsQuery.andWhere("booking.created_at <= :end", { end: new Date(end_date as string) });
        }
        
        const revenueResult = await bookingsQuery
          .select("SUM(booking.payment_amount)", "total")
          .andWhere("booking.payment_status IN (:...statuses)", { statuses: [PaymentStatus.PAID, PaymentStatus.PARTIAL] })
          .getRawOne();

        const totalRevenue = parseFloat(revenueResult?.total || "0");
        const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;

        return {
          agent_id: user.id,
          agent_name: user.name,
          agent_email: user.email,
          agent_role: user.role,
          total_leads: totalLeads,
          contacted,
          not_contacted: notContacted,
          converted,
          conversion_rate: conversionRate,
          calls_made: callsMade,
          total_revenue: totalRevenue,
          // Lead stages
          stage_new: stageNew,
          stage_interested: stageInterested,
          stage_followup: stageFollowup,
          stage_negotiation: stageNegotiation,
          stage_won: stageWon,
          stage_lost: stageLost,
          stage_not_interested: stageNotInterested,
        };
      })
    );

    // Calculate "System" row for unassigned leads and leads assigned to admin/default
    let systemLeadsQuery = leadRepository().createQueryBuilder("lead")
      .where("(lead.assigned_to IS NULL OR lead.assigned_to IN (:...adminIds) OR lead.assigned_name = :defaultName)", 
        { adminIds: adminIds.length > 0 ? adminIds : ['no-admin'], defaultName: 'Default' });
    
    if (start_date) {
      systemLeadsQuery = systemLeadsQuery.andWhere("lead.created_at >= :start", { start: new Date(start_date as string) });
    }
    if (end_date) {
      systemLeadsQuery = systemLeadsQuery.andWhere("lead.created_at <= :end", { end: new Date(end_date as string) });
    }

    const systemTotalLeads = await systemLeadsQuery.getCount();
    const systemContacted = await systemLeadsQuery.clone()
      .andWhere("lead.status != :newStatus", { newStatus: LeadStatus.NEW })
      .getCount();
    const systemNotContacted = systemTotalLeads - systemContacted;
    const systemConverted = await systemLeadsQuery.clone()
      .andWhere("lead.status = :wonStatus", { wonStatus: LeadStatus.WON })
      .getCount();
    const systemConversionRate = systemTotalLeads > 0 ? Math.round((systemConverted / systemTotalLeads) * 100) : 0;

    const systemAgent = {
      agent_id: 'system',
      agent_name: 'System (Unassigned/Admin)',
      agent_email: 'system@bidinn.com',
      agent_role: 'system',
      total_leads: systemTotalLeads,
      contacted: systemContacted,
      not_contacted: systemNotContacted,
      converted: systemConverted,
      conversion_rate: systemConversionRate,
      calls_made: 0,
      total_revenue: 0,
    };

    // Add system row to agents if showing all or specifically selected
    const allAgentsWithSystem = agent_id === 'system' 
      ? [systemAgent] 
      : (agent_id && agent_id !== 'all' ? agents : [...agents, systemAgent]);

    // Calculate team summary (including system leads)
    const teamSummary = {
      total_leads: agents.reduce((sum, a) => sum + a.total_leads, 0) + systemTotalLeads,
      contacted: agents.reduce((sum, a) => sum + a.contacted, 0) + systemContacted,
      not_contacted: agents.reduce((sum, a) => sum + a.not_contacted, 0) + systemNotContacted,
      converted: agents.reduce((sum, a) => sum + a.converted, 0) + systemConverted,
      total_revenue: agents.reduce((sum, a) => sum + a.total_revenue, 0),
    };

    res.json({
      agents: allAgentsWithSystem,
      team_summary: teamSummary,
      all_agents: [
        ...allAgents.map(a => ({ id: a.id, name: a.name, role: a.role })),
        { id: 'system', name: 'System (Unassigned/Admin)', role: 'system' },
      ],
    });
  } catch (error) {
    console.error("Get agent-performance error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get revenue trend
router.get("/revenue-trend", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // Get last 30 days revenue by day
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const result = await bookingRepository()
      .createQueryBuilder("booking")
      .select("DATE(booking.created_at)", "date")
      .addSelect("SUM(booking.payment_amount)", "revenue")
      .where("booking.created_at >= :start", { start: thirtyDaysAgo })
      .andWhere("booking.payment_status IN (:...statuses)", { statuses: [PaymentStatus.PAID, PaymentStatus.PARTIAL] })
      .groupBy("DATE(booking.created_at)")
      .orderBy("date", "ASC")
      .getRawMany();

    res.json(result.map(r => ({ date: r.date, revenue: parseFloat(r.revenue || "0") })));
  } catch (error) {
    console.error("Get revenue-trend error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get source performance
router.get("/source-performance", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await leadRepository()
      .createQueryBuilder("lead")
      .select("lead.source", "source")
      .addSelect("COUNT(*)", "total")
      .addSelect("SUM(CASE WHEN lead.status = 'won' THEN 1 ELSE 0 END)", "won")
      .groupBy("lead.source")
      .getRawMany();

    res.json(result.map(r => ({
      source: r.source,
      total: parseInt(r.total || "0"),
      won: parseInt(r.won || "0"),
      conversion_rate: r.total > 0 ? (r.won / r.total) * 100 : 0,
    })));
  } catch (error) {
    console.error("Get source-performance error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
