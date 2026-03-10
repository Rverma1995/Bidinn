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

        const totalCalls = await callRepository().count({
          where: { user_id: user.id },
        });

        const revenueResult = await bookingRepository()
          .createQueryBuilder("booking")
          .select("SUM(booking.payment_amount)", "total")
          .where("booking.created_by_id = :userId", { userId: user.id })
          .andWhere("booking.payment_status IN (:...statuses)", { statuses: [PaymentStatus.PAID, PaymentStatus.PARTIAL] })
          .getRawOne();

        return {
          id: user.id,
          name: user.name,
          role: user.role,
          deals_closed: wonLeads,
          calls_made: totalCalls,
          revenue: parseFloat(revenueResult?.total || "0"),
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

export default router;
