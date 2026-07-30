import { Router, Response } from "express";
import { cacheMiddleware, invalidateCacheMiddleware } from "../middleware/cache";
import { CACHE_KEYS, CACHE_TTL } from "../config/cache.constants";
import { AppDataSource } from "../config/data-source";
import { User, UserRole, Lead, LeadStatus, Activity, Booking, Payment, Call, Notification } from "../entities";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// Automatically invalidate caches on any successful mutation in this router
router.use(invalidateCacheMiddleware([CACHE_KEYS.ADMIN_STATS, CACHE_KEYS.DASHBOARD_STATS]));

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
router.get("/features", cacheMiddleware(CACHE_KEYS.ADMIN_STATS, CACHE_TTL.SHORT, false), async (req, res: Response) => {
  res.json({
    telephony_enabled: process.env.TELEPHONY_ENABLED === "true",
  });
});

// Export database (Admin only)
router.get("/export-database", authenticateToken, requireRole([UserRole.ADMIN]), cacheMiddleware(CACHE_KEYS.ADMIN_STATS, CACHE_TTL.SHORT, false), async (req: AuthRequest, res: Response) => {
  try {
    console.log("Starting database export...");
    
    // Fetch all data
    const [leads, bookings, payments, calls, activities, notifications, users] = await Promise.all([
      leadRepository().find(),
      bookingRepository().find(),
      paymentRepository().find(),
      callRepository().find(),
      activityRepository().find(),
      notificationRepository().find(),
      userRepository().find({ select: ["id", "email", "name", "role", "is_active", "created_at"] }), // Exclude password_hash
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      exported_by: req.user?.email,
      version: "1.0",
      data: {
        users: users.map(u => ({ ...u, password_hash: undefined })), // Ensure no passwords
        leads,
        bookings,
        payments,
        calls,
        activities,
        notifications,
      },
      counts: {
        users: users.length,
        leads: leads.length,
        bookings: bookings.length,
        payments: payments.length,
        calls: calls.length,
        activities: activities.length,
        notifications: notifications.length,
      },
    };

    console.log(`Database export complete: ${leads.length} leads, ${bookings.length} bookings, ${payments.length} payments`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=bidinn-backup-${new Date().toISOString().split('T')[0]}.json`);
    res.json(exportData);
  } catch (error) {
    console.error("Export database error:", error);
    res.status(500).json({ detail: "Failed to export database" });
  }
});

// Delete all data (Admin only) - DANGEROUS!
router.delete("/delete-database", authenticateToken, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    console.log(`Database deletion initiated by ${req.user?.email}`);
    
    // Delete in order to respect foreign key constraints
    // Use createQueryBuilder for bulk deletes (TypeORM doesn't allow empty criteria in delete())
    
    const notificationsDeleted = await notificationRepository()
      .createQueryBuilder()
      .delete()
      .from(Notification)
      .execute();
    console.log(`Deleted ${notificationsDeleted.affected} notifications`);
    
    const activitiesDeleted = await activityRepository()
      .createQueryBuilder()
      .delete()
      .from(Activity)
      .execute();
    console.log(`Deleted ${activitiesDeleted.affected} activities`);
    
    const callsDeleted = await callRepository()
      .createQueryBuilder()
      .delete()
      .from(Call)
      .execute();
    console.log(`Deleted ${callsDeleted.affected} calls`);
    
    const paymentsDeleted = await paymentRepository()
      .createQueryBuilder()
      .delete()
      .from(Payment)
      .execute();
    console.log(`Deleted ${paymentsDeleted.affected} payments`);
    
    const bookingsDeleted = await bookingRepository()
      .createQueryBuilder()
      .delete()
      .from(Booking)
      .execute();
    console.log(`Deleted ${bookingsDeleted.affected} bookings`);
    
    const leadsDeleted = await leadRepository()
      .createQueryBuilder()
      .delete()
      .from(Lead)
      .execute();
    console.log(`Deleted ${leadsDeleted.affected} leads`);
    
    // Log this action in activities (since we just deleted all activities, create a new one)
    const deleteActivity = activityRepository().create({
      id: uuidv4(),
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: "database_cleared",
      target_id: "all",
      target_type: "system",
      target_name: "Database",
      details: `All data deleted by ${req.user!.email}. Deleted: ${leadsDeleted.affected} leads, ${bookingsDeleted.affected} bookings, ${paymentsDeleted.affected} payments, ${callsDeleted.affected} calls.`,
    });
    await activityRepository().save(deleteActivity);

    res.json({ 
      message: "All data deleted successfully",
      deleted: {
        leads: leadsDeleted.affected,
        bookings: bookingsDeleted.affected,
        payments: paymentsDeleted.affected,
        calls: callsDeleted.affected,
        activities: activitiesDeleted.affected,
        notifications: notificationsDeleted.affected,
      }
    });
  } catch (error) {
    console.error("Delete database error:", error);
    res.status(500).json({ detail: "Failed to delete database" });
  }
});

export default router;
