import { Router, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { User, UserRole, Lead, LeadStatus, Activity, Booking, Payment, Call, Notification } from "../entities";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();
const userRepository = () => AppDataSource.getRepository(User);
const leadRepository = () => AppDataSource.getRepository(Lead);
const activityRepository = () => AppDataSource.getRepository(Activity);
const bookingRepository = () => AppDataSource.getRepository(Booking);
const paymentRepository = () => AppDataSource.getRepository(Payment);
const callRepository = () => AppDataSource.getRepository(Call);
const notificationRepository = () => AppDataSource.getRepository(Notification);

// Run auto-reset job
router.post("/run-auto-reset", authenticateToken, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const leadsToReset = await leadRepository()
      .createQueryBuilder("lead")
      .where("lead.status NOT IN (:...statuses)", { statuses: [LeadStatus.NEW, LeadStatus.WON, LeadStatus.LOST] })
      .andWhere("lead.last_activity < :date", { date: thirtyDaysAgo })
      .getMany();

    let resetCount = 0;

    for (const lead of leadsToReset) {
      lead.status = LeadStatus.NEW;
      lead.assigned_to = undefined;
      lead.assigned_name = undefined;
      await leadRepository().save(lead);

      // Log activity
      const activity = activityRepository().create({
        id: uuidv4(),
        user_id: "system",
        user_name: "System",
        action: "auto_reset",
        target_id: lead.id,
        target_type: "lead",
        target_name: lead.name,
        details: "Lead reset due to 30 days of inactivity",
      });
      await activityRepository().save(activity);

      resetCount++;
    }

    res.json({ message: `Auto-reset completed. ${resetCount} leads reset.` });
  } catch (error) {
    console.error("Auto-reset error:", error);
    res.status(500).json({ detail: "Failed to run auto-reset" });
  }
});

// Seed demo data (redirect to app auto-seed)
router.post("/seed-data", authenticateToken, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const userCount = await userRepository().count();
    if (userCount > 1) {
      res.json({ message: "Data already seeded" });
      return;
    }
    res.json({ message: "Use server auto-seed on startup. Restart the server to seed data." });
  } catch (error) {
    console.error("Seed data error:", error);
    res.status(500).json({ detail: "Failed to seed data" });
  }
});

// Get feature flags
router.get("/features", async (req, res: Response) => {
  res.json({
    telephony_enabled: process.env.TELEPHONY_ENABLED === "true",
  });
});

export default router;
