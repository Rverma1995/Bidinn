import "reflect-metadata";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

// Load environment variables first
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { AppDataSource, initializeDatabase } from "./config/data-source";
import { User, UserRole, Lead, LeadStatus, Booking, PaymentStatus, Activity, Notification, NotificationType, NotificationPriority } from "./entities";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import leadRoutes from "./routes/leads";
import callRoutes from "./routes/calls";
import bookingRoutes from "./routes/bookings";
import dashboardRoutes from "./routes/dashboard";
import activityRoutes from "./routes/activities";
import metaRoutes from "./routes/meta";
import paymentRoutes from "./routes/payments";
import adminRoutes from "./routes/admin";
import notificationRoutes from "./routes/notifications";
import { cacheService } from "./services/cache.service";

const app = express();
const PORT = parseInt(process.env.PORT || "8001");

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS || "*";
app.use(
  cors({
    origin: corsOrigins === "*" ? "*" : corsOrigins.split(","),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parsing middleware with raw body capture for webhook signature verification
app.use(express.json({ 
  limit: "50mb",
  verify: (req: any, res, buf) => {
    // Store raw body for webhook signature verification
    if (req.url === '/api/meta/webhook' || req.originalUrl === '/api/meta/webhook') {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Disable caching for all API responses to ensure fresh data
app.use((req: Request, res: Response, next: NextFunction) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// API routes - all prefixed with /api
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);

// Root API endpoint
app.get("/api/", (req: Request, res: Response) => {
  res.json({ message: "Bidinn CRM API", version: "2.0.0", orm: "TypeORM" });
});

// Health check
app.get("/api/health", async (req: Request, res: Response) => {
  try {
    if (AppDataSource.isInitialized) {
      res.json({ status: "healthy", database: "connected", orm: "TypeORM" });
    } else {
      res.status(500).json({ status: "unhealthy", database: "disconnected" });
    }
  } catch (error) {
    res.status(500).json({ status: "unhealthy", database: "disconnected" });
  }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({ detail: "Internal server error" });
});

// 404 handler for API routes
app.use("/api/*", (req: Request, res: Response) => {
  res.status(404).json({ detail: "Not found" });
});

// Serve frontend static files in production
const frontendPath = path.join(__dirname, "../../frontend/build");
app.use(express.static(frontendPath));

// Catch-all route to serve React app for non-API requests
app.get("*", (req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Auto-reset job function (runs daily)
const runAutoResetJob = async () => {
  console.log("Running 30-day auto-reset job...");
  try {
    const leadRepository = AppDataSource.getRepository(Lead);
    const activityRepository = AppDataSource.getRepository(Activity);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const leadsToReset = await leadRepository
      .createQueryBuilder("lead")
      .where("lead.status NOT IN (:...statuses)", { statuses: [LeadStatus.NEW, LeadStatus.WON, LeadStatus.LOST] })
      .andWhere("lead.last_activity < :date", { date: thirtyDaysAgo })
      .getMany();

    let resetCount = 0;

    for (const lead of leadsToReset) {
      // Reset the lead
      lead.status = LeadStatus.NEW;
      lead.assigned_to = undefined;
      lead.assigned_name = undefined;
      await leadRepository.save(lead);

      // Log activity
      const activity = activityRepository.create({
        id: uuidv4(),
        user_id: "system",
        user_name: "System",
        action: "auto_reset",
        target_id: lead.id,
        target_type: "lead",
        target_name: lead.name,
        details: "Lead reset due to 30 days of inactivity",
      });
      await activityRepository.save(activity);

      resetCount++;
    }

    console.log(`Auto-reset job completed. ${resetCount} leads reset.`);
  } catch (error) {
    console.error("Auto-reset job error:", error);
  }
};

// Schedule auto-reset job to run daily at midnight - DISABLED
const scheduleAutoResetJob = () => {
  // DISABLED: Auto-reset job is disabled per user request
  console.log("Auto-reset job is DISABLED");
  // const now = new Date();
  // const midnight = new Date(now);
  // midnight.setDate(midnight.getDate() + 1);
  // midnight.setHours(0, 0, 0, 0);
  // const msUntilMidnight = midnight.getTime() - now.getTime();
  // setTimeout(() => {
  //   runAutoResetJob();
  //   setInterval(runAutoResetJob, 24 * 60 * 60 * 1000);
  // }, msUntilMidnight);
  // console.log(`Auto-reset job scheduled. Next run in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`);
};

// Rule 4: Idle Lead Escalation Job - runs every 6 hours
const runIdleLeadEscalationJob = async () => {
  console.log("Running idle lead escalation job...");
  try {
    const leadRepository = AppDataSource.getRepository(Lead);
    const userRepository = AppDataSource.getRepository(User);
    const notificationRepository = AppDataSource.getRepository(Notification);
    const activityRepository = AppDataSource.getRepository(Activity);

    // Find leads with no activity for 5 days
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    // Get idle leads that are in active statuses (not won, lost, or not_interested)
    const idleLeads = await leadRepository
      .createQueryBuilder("lead")
      .where("lead.status NOT IN (:...statuses)", { 
        statuses: [LeadStatus.WON, LeadStatus.LOST, LeadStatus.NOT_INTERESTED] 
      })
      .andWhere("(lead.last_activity < :fiveDaysAgo OR lead.last_activity IS NULL)", { fiveDaysAgo })
      .andWhere("lead.created_at < :fiveDaysAgo", { fiveDaysAgo })
      .getMany();

    if (idleLeads.length === 0) {
      console.log("No idle leads found.");
      return;
    }

    // Get all managers and admins
    const managersAndAdmins = await userRepository.find({
      where: [
        { role: UserRole.ADMIN, is_active: true },
        { role: UserRole.MANAGER, is_active: true },
      ],
    });

    // Create notifications for each manager/admin
    for (const user of managersAndAdmins) {
      // Create a summary notification
      const notification = notificationRepository.create({
        id: uuidv4(),
        user_id: user.id,
        type: NotificationType.IDLE_LEAD,
        priority: NotificationPriority.HIGH,
        title: `${idleLeads.length} Idle Lead${idleLeads.length > 1 ? 's' : ''} Detected`,
        message: `The following lead${idleLeads.length > 1 ? 's have' : ' has'} had no activity for 5+ days:\n${idleLeads
          .slice(0, 10)
          .map(l => `• ${l.name} (${l.phone}) - ${l.assigned_name || 'Unassigned'} - Status: ${l.status}`)
          .join('\n')}${idleLeads.length > 10 ? `\n...and ${idleLeads.length - 10} more` : ''}`,
        metadata: {
          idle_lead_ids: idleLeads.map(l => l.id),
          idle_lead_count: idleLeads.length,
          lead_details: idleLeads.slice(0, 20).map(l => ({
            id: l.id,
            name: l.name,
            phone: l.phone,
            status: l.status,
            assigned_name: l.assigned_name,
            last_activity: l.last_activity,
          })),
        },
      });
      await notificationRepository.save(notification);
    }

    // Log activity for tracking (use null for user_id for system activities)
    const activity = activityRepository.create({
      id: uuidv4(),
      user_id: null as any,
      user_name: "System",
      action: "idle_lead_escalation",
      target_id: null as any,
      target_type: "escalation",
      target_name: "Idle Lead Check",
      details: `Detected ${idleLeads.length} idle leads and notified ${managersAndAdmins.length} managers/admins`,
    });
    await activityRepository.save(activity);

    console.log(`Idle lead escalation: Notified ${managersAndAdmins.length} managers/admins about ${idleLeads.length} idle leads`);
  } catch (error) {
    console.error("Idle lead escalation job error:", error);
  }
};

// Schedule idle lead escalation job to run every 6 hours
const scheduleIdleLeadEscalationJob = () => {
  // Run immediately on startup (after a small delay for DB connection)
  setTimeout(() => {
    runIdleLeadEscalationJob();
  }, 10000); // 10 seconds after startup

  // Then run every 6 hours
  setInterval(runIdleLeadEscalationJob, 6 * 60 * 60 * 1000);
  console.log("Idle lead escalation job scheduled to run every 6 hours");
};

// ============ FOLLOWUP REMINDER JOB ============

const runFollowupReminderJob = async () => {
  try {
    const leadRepository = AppDataSource.getRepository(Lead);
    const userRepository = AppDataSource.getRepository(User);
    const notificationRepository = AppDataSource.getRepository(Notification);

    const now = new Date();
    const thirtyMinsFromNow = new Date(now.getTime() + 30 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // --- UPCOMING FOLLOWUPS (within the next 30 minutes) ---
    const upcomingLeads = await leadRepository
      .createQueryBuilder("lead")
      .where("lead.next_followup > :now", { now: now.toISOString() })
      .andWhere("lead.next_followup <= :soon", { soon: thirtyMinsFromNow.toISOString() })
      .andWhere("lead.status NOT IN (:...exclude)", { exclude: ["won", "lost"] })
      .getMany();

    // --- MISSED FOLLOWUPS (past due, within last 24 hours to avoid old spam) ---
    const missedLeads = await leadRepository
      .createQueryBuilder("lead")
      .where("lead.next_followup < :now", { now: now.toISOString() })
      .andWhere("lead.next_followup > :cutoff", { cutoff: twentyFourHoursAgo.toISOString() })
      .andWhere("lead.status NOT IN (:...exclude)", { exclude: ["won", "lost"] })
      .getMany();

    if (upcomingLeads.length === 0 && missedLeads.length === 0) {
      console.log("Followup reminder job: No upcoming or missed followups found");
      return;
    }

    // Get all admins
    const admins = await userRepository.find({
      where: [
        { role: UserRole.ADMIN, is_active: true },
        { role: UserRole.MANAGER, is_active: true },
      ],
    });
    const adminIds = new Set(admins.map(a => a.id));

    // Helper: check if a recent notification already exists for this lead + type + user
    const alreadyNotified = async (userId: string, type: string, leadId: string): Promise<boolean> => {
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const existing = await notificationRepository
        .createQueryBuilder("n")
        .where("n.user_id = :userId", { userId })
        .andWhere("n.type = :type", { type })
        .andWhere("n.target_id = :leadId", { leadId })
        .andWhere("n.created_at > :since", { since: twoHoursAgo.toISOString() })
        .getCount();
      return existing > 0;
    };

    let createdCount = 0;

    // --- Create UPCOMING followup notifications ---
    for (const lead of upcomingLeads) {
      const recipientIds: string[] = [];
      if (lead.assigned_to) recipientIds.push(lead.assigned_to);
      admins.forEach(a => { if (!recipientIds.includes(a.id)) recipientIds.push(a.id); });

      const followupTime = new Date(lead.next_followup!);
      const minsUntil = Math.round((followupTime.getTime() - now.getTime()) / 60000);

      for (const userId of recipientIds) {
        if (await alreadyNotified(userId, NotificationType.FOLLOWUP_UPCOMING, lead.id)) continue;

        const isAssignedUser = userId === lead.assigned_to;
        const notification = notificationRepository.create({
          id: uuidv4(),
          user_id: userId,
          type: NotificationType.FOLLOWUP_UPCOMING,
          priority: NotificationPriority.HIGH,
          title: `Upcoming Follow-up in ${minsUntil} min`,
          message: `${lead.name} (${lead.phone})${!isAssignedUser && lead.assigned_name ? ` — Assigned to ${lead.assigned_name}` : ''} has a follow-up scheduled at ${followupTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
          target_id: lead.id,
          target_type: "lead",
          metadata: {
            lead_name: lead.name,
            lead_phone: lead.phone,
            followup_time: lead.next_followup,
            assigned_to: lead.assigned_name,
          },
        });
        await notificationRepository.save(notification);
        createdCount++;
      }
    }

    // --- Create MISSED followup notifications ---
    for (const lead of missedLeads) {
      const recipientIds: string[] = [];
      if (lead.assigned_to) recipientIds.push(lead.assigned_to);
      admins.forEach(a => { if (!recipientIds.includes(a.id)) recipientIds.push(a.id); });

      const followupTime = new Date(lead.next_followup!);
      const minsOverdue = Math.round((now.getTime() - followupTime.getTime()) / 60000);
      const overdueLabel = minsOverdue >= 60 ? `${Math.round(minsOverdue / 60)}h` : `${minsOverdue}m`;

      for (const userId of recipientIds) {
        if (await alreadyNotified(userId, NotificationType.FOLLOWUP_MISSED, lead.id)) continue;

        const isAssignedUser = userId === lead.assigned_to;
        const notification = notificationRepository.create({
          id: uuidv4(),
          user_id: userId,
          type: NotificationType.FOLLOWUP_MISSED,
          priority: NotificationPriority.HIGH,
          title: `Missed Follow-up (${overdueLabel} overdue)`,
          message: `${lead.name} (${lead.phone})${!isAssignedUser && lead.assigned_name ? ` — Assigned to ${lead.assigned_name}` : ''} had a follow-up at ${followupTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} that was missed.`,
          target_id: lead.id,
          target_type: "lead",
          metadata: {
            lead_name: lead.name,
            lead_phone: lead.phone,
            followup_time: lead.next_followup,
            assigned_to: lead.assigned_name,
            overdue_minutes: minsOverdue,
          },
        });
        await notificationRepository.save(notification);
        createdCount++;
      }
    }

    console.log(`Followup reminder job: ${upcomingLeads.length} upcoming, ${missedLeads.length} missed, ${createdCount} notifications created`);
  } catch (error) {
    console.error("Followup reminder job error:", error);
  }
};

// Schedule followup reminder job to run every 15 minutes
const scheduleFollowupReminderJob = () => {
  setTimeout(() => {
    runFollowupReminderJob();
  }, 15000); // 15 seconds after startup

  setInterval(runFollowupReminderJob, 15 * 60 * 1000); // every 15 minutes
  console.log("Followup reminder job scheduled to run every 15 minutes");
};

// Auto-seed database if empty - Creates initial admin user
const autoSeedIfEmpty = async () => {
  try {
    const userRepository = AppDataSource.getRepository(User);
    const userCount = await userRepository.count();

    if (userCount === 0) {
      console.log("Database is empty, creating admin user...");
      const bcrypt = require("bcryptjs");
      const { v4: uuidv4 } = require("uuid");
      
      // Create admin user
      const adminUser = userRepository.create({
        id: uuidv4(),
        email: "alex@bidinn.com",
        name: "Alex Admin",
        password_hash: await bcrypt.hash("password123", 10),
        role: UserRole.ADMIN,
        is_active: true,
      });
      await userRepository.save(adminUser);
      console.log("Admin user created: alex@bidinn.com / password123");
    } else {
      console.log(`Database has ${userCount} users`);
    }
  } catch (error) {
    console.error("Auto-seed check error:", error);
  }
};

// Seed demo data function
const seedDemoData = async () => {
  const userRepository = AppDataSource.getRepository(User);
  const leadRepository = AppDataSource.getRepository(Lead);
  const bookingRepository = AppDataSource.getRepository(Booking);

  // Demo users with roles
  const demoUsers = [
    { email: "alex@bidinn.com", name: "Alex Thompson", role: UserRole.ADMIN, password: "password123" },
    { email: "sarah@bidinn.com", name: "Sarah Wilson", role: UserRole.MANAGER, password: "password123" },
    { email: "michael@bidinn.com", name: "Michael Chen", role: UserRole.TEAM_LEAD, password: "password123" },
    { email: "emily@bidinn.com", name: "Emily Davis", role: UserRole.SALES_REP, password: "password123" },
    { email: "james@bidinn.com", name: "James Miller", role: UserRole.SALES_REP, password: "password123" },
    { email: "olivia@bidinn.com", name: "Olivia Brown", role: UserRole.SALES_REP, password: "password123" },
    { email: "william@bidinn.com", name: "William Taylor", role: UserRole.SALES_REP, password: "password123" },
    { email: "sophia@bidinn.com", name: "Sophia Martinez", role: UserRole.SALES_REP, password: "password123" },
    { email: "benjamin@bidinn.com", name: "Benjamin Garcia", role: UserRole.TEAM_LEAD, password: "password123" },
    { email: "ava@bidinn.com", name: "Ava Johnson", role: UserRole.SALES_REP, password: "password123" },
    { email: "lucas@bidinn.com", name: "Lucas Anderson", role: UserRole.SALES_REP, password: "password123" },
    { email: "mia@bidinn.com", name: "Mia Thomas", role: UserRole.SALES_REP, password: "password123" },
    { email: "robert@bidinn.com", name: "Robert Taylor", role: UserRole.MANAGER, password: "password123" },
    { email: "lisa@bidinn.com", name: "Lisa Anderson", role: UserRole.SALES_REP, password: "password123" },
    { email: "david@bidinn.com", name: "David Wilson", role: UserRole.SALES_REP, password: "password123" },
  ];

  const createdUsers: User[] = [];

  // Insert users
  for (const userData of demoUsers) {
    const user = userRepository.create({
      id: uuidv4(),
      email: userData.email,
      name: userData.name,
      role: userData.role,
      password_hash: await bcrypt.hash(userData.password, 10),
      is_active: true,
    });
    await userRepository.save(user);
    createdUsers.push(user);
  }

  // Demo leads
  const leadSources = ["Website", "Referral", "LinkedIn", "Cold Call", "Meta Lead Ads", "Trade Show", "Email Campaign"];
  const campaigns = ["Flight Ticket", "Dubai Tour", "Thailand Tour", "Manali Tour", "Sri Lanka", "Maldives", "Singapore"];
  const leadStatuses = [LeadStatus.NEW, LeadStatus.NOT_ANSWERED, LeadStatus.INTERESTED, LeadStatus.NOT_INTERESTED, LeadStatus.WON, LeadStatus.LOST];
  const cities = ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad", "Pune", "Kolkata"];

  const salesReps = createdUsers.filter((u) => [UserRole.SALES_REP, UserRole.TEAM_LEAD].includes(u.role));

  for (let i = 0; i < 100; i++) {
    const status = leadStatuses[Math.floor(Math.random() * leadStatuses.length)];
    const source = leadSources[Math.floor(Math.random() * leadSources.length)];
    const campaign = campaigns[Math.floor(Math.random() * campaigns.length)];
    const assignedUser = salesReps[Math.floor(Math.random() * salesReps.length)];
    const city = cities[Math.floor(Math.random() * cities.length)];

    const createdAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    const lastActivity = new Date(createdAt.getTime() + Math.random() * (Date.now() - createdAt.getTime()));

    const firstName = ["Ravi", "Priya", "Amit", "Sneha", "Vijay", "Anjali", "Rahul", "Pooja", "Kiran", "Neha"][Math.floor(Math.random() * 10)];
    const lastName = ["Kumar", "Sharma", "Patel", "Singh", "Verma", "Gupta", "Reddy", "Nair", "Joshi", "Das"][Math.floor(Math.random() * 10)];

    const lead = leadRepository.create({
      id: uuidv4(),
      name: `${firstName} ${lastName}`,
      phone: `+91 ${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`,
      city,
      source,
      campaign,
      status,
      assigned_to: assignedUser.id,
      assigned_name: assignedUser.name,
      notes: `Interested in ${campaign}. Budget: ₹${Math.floor(Math.random() * 500000 + 50000)}`,
      attempt_count: Math.floor(Math.random() * 5),
      last_activity: lastActivity,
      created_at: createdAt,
    });

    await leadRepository.save(lead);

    // Add booking for won leads
    if (status === LeadStatus.WON) {
      const price = Math.floor(Math.random() * 200000 + 50000);
      const paymentAmount = Math.floor(price * (0.3 + Math.random() * 0.7));

      const booking = bookingRepository.create({
        id: uuidv4(),
        lead_id: lead.id,
        lead_name: lead.name,
        hotel_name: `${campaign} Package`,
        check_in: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000),
        check_out: new Date(Date.now() + (30 + Math.random() * 30) * 24 * 60 * 60 * 1000),
        final_price: price,
        bid_price: price,
        payment_status: paymentAmount >= price ? PaymentStatus.PAID : PaymentStatus.PARTIAL,
        payment_amount: paymentAmount,
        booking_reason: campaign,
        created_by_id: assignedUser.id,
      });

      await bookingRepository.save(booking);
    }
  }

  console.log("Seeded 15 users, 100 leads, and related bookings");
};

// Initialize database and start server
const startServer = async () => {
  try {
    await initializeDatabase();
    console.log("TypeORM database connection established");

    await cacheService.connect();

    // Auto-seed if database is empty
    await autoSeedIfEmpty();

    // Schedule the auto-reset job
    scheduleAutoResetJob();

    // Schedule the idle lead escalation job (Rule 4)
    scheduleIdleLeadEscalationJob();

    // Schedule the followup reminder job
    scheduleFollowupReminderJob();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Bidinn CRM API server running on http://0.0.0.0:${PORT}`);
      console.log(`Using TypeORM with MySQL database`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
