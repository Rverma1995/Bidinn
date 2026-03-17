import { Router, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { 
  Lead, LeadStatus, ClosedReason, 
  STAGE_TRANSITIONS, STAGES_REQUIRING_ASSIGNMENT, STAGES_REQUIRING_REASON,
  User, UserRole, Activity, Notification, NotificationType, NotificationPriority 
} from "../entities";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";
import { In } from "typeorm";
import multer from "multer";
import * as XLSX from "xlsx";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  }
});

const router = Router();
const leadRepository = () => AppDataSource.getRepository(Lead);
const userRepository = () => AppDataSource.getRepository(User);
const activityRepository = () => AppDataSource.getRepository(Activity);
const notificationRepository = () => AppDataSource.getRepository(Notification);

// Closed reason labels for frontend
export const CLOSED_REASON_LABELS: Record<string, string> = {
  price_too_high: "Price Too High",
  booked_elsewhere: "Booked Elsewhere",
  not_travelling: "Not Travelling",
  no_response: "No Response",
  just_browsing: "Just Browsing",
  wrong_contact: "Wrong Contact",
  competitor: "Went to Competitor",
  budget_issues: "Budget Issues",
  timing_not_right: "Timing Not Right",
  other: "Other",
};

// Helper to log activity
const logActivity = async (userId: string, userName: string, action: string, targetId: string, targetType: string, targetName: string, details?: string) => {
  const activity = activityRepository().create({
    id: uuidv4(),
    user_id: userId,
    user_name: userName,
    action,
    target_id: targetId,
    target_type: targetType,
    target_name: targetName,
    details,
  });
  await activityRepository().save(activity);
};

// Helper to create notification for managers/admins
const notifyManagersAndAdmins = async (type: NotificationType, title: string, message: string, targetId?: string, targetType?: string, metadata?: Record<string, any>, priority: NotificationPriority = NotificationPriority.MEDIUM) => {
  const managersAndAdmins = await userRepository().find({
    where: [
      { role: UserRole.ADMIN, is_active: true },
      { role: UserRole.MANAGER, is_active: true },
    ],
  });

  for (const user of managersAndAdmins) {
    const notification = notificationRepository().create({
      id: uuidv4(),
      user_id: user.id,
      type,
      priority,
      title,
      message,
      target_id: targetId,
      target_type: targetType,
      metadata,
    });
    await notificationRepository().save(notification);
  }
};

// Get closed reasons list
router.get("/closed-reasons", authenticateToken, async (req: AuthRequest, res: Response) => {
  const reasons = Object.entries(CLOSED_REASON_LABELS).map(([value, label]) => ({
    value,
    label,
  }));
  res.json(reasons);
});

// Get all leads with pagination
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    let queryBuilder = leadRepository().createQueryBuilder("lead");

    // Sales reps only see their assigned leads
    if (user.role === UserRole.SALES_REP) {
      queryBuilder = queryBuilder.where("lead.assigned_to = :userId", { userId: user.id });
    }

    // Get total count for pagination
    const totalCount = await queryBuilder.getCount();

    // Apply pagination and ordering
    queryBuilder = queryBuilder
      .orderBy("lead.created_at", "DESC")
      .skip(skip)
      .take(limit);

    const leads = await queryBuilder.getMany();

    // Add computed fields
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const enrichedLeads = leads.map((lead) => {
      const createdAt = new Date(lead.created_at);
      const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      const isOverdue = lead.status === LeadStatus.NEW && lead.attempt_count === 0 && createdAt < oneHourAgo;

      return {
        ...lead,
        hours_since_creation: Math.round(hoursSinceCreation * 10) / 10,
        is_overdue: isOverdue,
        closed_reason_label: lead.closed_reason ? CLOSED_REASON_LABELS[lead.closed_reason] : null,
      };
    });

    res.json({
      leads: enrichedLeads,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      }
    });
  } catch (error) {
    console.error("Get leads error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get uncontacted leads - MUST be before /:id route
router.get("/uncontacted", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    let queryBuilder = leadRepository()
      .createQueryBuilder("lead")
      .where("lead.status = :status", { status: LeadStatus.NEW })
      .andWhere("lead.attempt_count = 0")
      .andWhere("lead.created_at < :oneHourAgo", { oneHourAgo });

    if (user.role === UserRole.SALES_REP) {
      queryBuilder = queryBuilder.andWhere("lead.assigned_to = :userId", { userId: user.id });
    }

    const leads = await queryBuilder.orderBy("lead.created_at", "ASC").getMany();
    res.json(leads);
  } catch (error) {
    console.error("Get uncontacted leads error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Export leads as CSV - MUST be before /:id route
router.get("/export/csv", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let queryBuilder = leadRepository().createQueryBuilder("lead");

    if (user.role === UserRole.SALES_REP) {
      queryBuilder = queryBuilder.where("lead.assigned_to = :userId", { userId: user.id });
    }

    const leads = await queryBuilder.orderBy("lead.created_at", "DESC").getMany();

    // Generate CSV
    const headers = ["Name", "Phone", "Email", "Source", "Campaign", "City", "Status", "Assigned To", "Created At"];
    const csvRows = [headers.join(",")];

    leads.forEach((lead) => {
      const row = [
        `"${lead.name}"`,
        `"${lead.phone}"`,
        `"${lead.email || ""}"`,
        `"${lead.source}"`,
        `"${lead.campaign || ""}"`,
        `"${lead.city || ""}"`,
        `"${lead.status}"`,
        `"${lead.assigned_name || "Unassigned"}"`,
        `"${lead.created_at}"`,
      ];
      csvRows.push(row.join(","));
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=leads_export.csv");
    res.send(csvRows.join("\n"));
  } catch (error) {
    console.error("Export leads error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Rule 3: Check for duplicate leads - endpoint for frontend
router.post("/check-duplicate", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { phone, email } = req.body;

    if (!phone && !email) {
      return res.json({ hasDuplicate: false, duplicates: [] });
    }

    let queryBuilder = leadRepository().createQueryBuilder("lead");
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (phone) {
      // Normalize phone number for comparison (remove spaces, dashes)
      const normalizedPhone = phone.replace(/[\s\-\(\)]/g, "");
      conditions.push("REPLACE(REPLACE(REPLACE(REPLACE(lead.phone, ' ', ''), '-', ''), '(', ''), ')', '') = :phone");
      params.phone = normalizedPhone;
    }

    if (email) {
      conditions.push("LOWER(lead.email) = LOWER(:email)");
      params.email = email;
    }

    queryBuilder = queryBuilder.where(conditions.join(" OR "), params);
    const duplicates = await queryBuilder.getMany();

    res.json({
      hasDuplicate: duplicates.length > 0,
      duplicates: duplicates.map(d => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        email: d.email,
        status: d.status,
        assigned_name: d.assigned_name,
        created_at: d.created_at,
      })),
    });
  } catch (error) {
    console.error("Check duplicate error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Rule 3: Merge leads endpoint
router.post("/merge", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req: AuthRequest, res: Response) => {
  try {
    const { sourceLeadId, targetLeadId, mergeData } = req.body;

    if (!sourceLeadId || !targetLeadId) {
      return res.status(400).json({ detail: "Source and target lead IDs are required" });
    }

    const sourceLead = await leadRepository().findOne({ where: { id: sourceLeadId } });
    const targetLead = await leadRepository().findOne({ where: { id: targetLeadId } });

    if (!sourceLead || !targetLead) {
      return res.status(404).json({ detail: "One or both leads not found" });
    }

    // Merge data into target lead (source is the new duplicate, target is the existing one)
    // Keep existing values unless overridden by mergeData
    if (mergeData) {
      if (mergeData.name) targetLead.name = mergeData.name;
      if (mergeData.phone) targetLead.phone = mergeData.phone;
      if (mergeData.email) targetLead.email = mergeData.email;
      if (mergeData.city) targetLead.city = mergeData.city;
      if (mergeData.source) targetLead.source = mergeData.source;
      if (mergeData.notes) {
        targetLead.notes = targetLead.notes 
          ? `${targetLead.notes}\n\n--- Merged from duplicate lead ---\n${mergeData.notes}`
          : mergeData.notes;
      }
    }

    // Append source notes to target if exists
    if (sourceLead.notes && !mergeData?.notes) {
      targetLead.notes = targetLead.notes 
        ? `${targetLead.notes}\n\n--- Merged from duplicate lead (${sourceLead.name}) ---\n${sourceLead.notes}`
        : `--- Merged from duplicate lead (${sourceLead.name}) ---\n${sourceLead.notes}`;
    }

    targetLead.last_activity = new Date();
    await leadRepository().save(targetLead);

    // Delete the source lead (duplicate)
    await leadRepository().remove(sourceLead);

    // Log activity
    await logActivity(
      req.user!.id,
      req.user!.name,
      "merged_leads",
      targetLead.id,
      "lead",
      targetLead.name,
      `Merged duplicate lead "${sourceLead.name}" into this lead`
    );

    // Notify managers and admins about the merge
    await notifyManagersAndAdmins(
      NotificationType.LEAD_MERGED,
      "Lead Merged",
      `Lead "${sourceLead.name}" (${sourceLead.phone}) was merged into "${targetLead.name}" (${targetLead.phone}) by ${req.user!.name}`,
      targetLead.id,
      "lead",
      {
        sourceLeadName: sourceLead.name,
        sourceLeadPhone: sourceLead.phone,
        targetLeadName: targetLead.name,
        targetLeadPhone: targetLead.phone,
        mergedBy: req.user!.name,
      },
      NotificationPriority.HIGH
    );

    res.json({
      message: "Leads merged successfully",
      lead: targetLead,
    });
  } catch (error) {
    console.error("Merge leads error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get duplicate leads analysis (Admin only) - MUST be before /:id route
router.get("/duplicates/analyze", authenticateToken, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    console.log("Starting duplicate analysis...");
    
    // Find all duplicate phone numbers using raw phone (data is already consistent)
    const duplicates = await leadRepository()
      .createQueryBuilder("lead")
      .select("lead.phone", "phone")
      .addSelect("COUNT(*)", "count")
      .groupBy("lead.phone")
      .having("COUNT(*) > 1")
      .getRawMany();

    console.log(`Found ${duplicates.length} duplicate phone groups`);

    // Calculate total duplicates to merge
    const totalDuplicates = duplicates.reduce((sum, dup) => sum + parseInt(dup.count) - 1, 0);

    // Only get details for first 20 groups to avoid timeout
    const duplicateGroups: any[] = [];
    const limitedDups = duplicates.slice(0, 20);

    for (const dup of limitedDups) {
      const phone = dup.phone;
      const leads = await leadRepository()
        .createQueryBuilder("lead")
        .where("lead.phone = :phone", { phone })
        .orderBy("lead.created_at", "ASC")
        .getMany();

      // Count activities for each lead
      const leadsWithActivity = await Promise.all(leads.map(async (lead) => {
        const activityCount = await activityRepository()
          .createQueryBuilder("activity")
          .where("activity.target_id = :leadId", { leadId: lead.id })
          .getCount();
        
        return {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          status: lead.status,
          assigned_to: lead.assigned_to,
          assigned_name: lead.assigned_name,
          attempt_count: lead.attempt_count,
          created_at: lead.created_at,
          activityCount,
          hasAssignment: !!lead.assigned_to,
          hasActivity: activityCount > 0 || lead.attempt_count > 0,
        };
      }));

      duplicateGroups.push({
        phone,
        count: parseInt(dup.count),
        leads: leadsWithActivity,
      });
    }

    console.log(`Total duplicates to merge: ${totalDuplicates}`);

    res.json({
      totalDuplicateGroups: duplicates.length,
      totalDuplicatesToMerge: totalDuplicates,
      duplicateGroups,
      message: duplicates.length > 20 ? `Showing first 20 of ${duplicates.length} duplicate groups` : undefined,
    });
  } catch (error) {
    console.error("Analyze duplicates error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Merge all duplicates (Admin only) - applies user's merge logic - MUST be before /:id route
router.post("/duplicates/merge-all", authenticateToken, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const adminUser = req.user!;
    console.log(`Starting duplicate merge process by ${adminUser.name}...`);
    
    // Find all duplicate phone numbers using raw phone (data is already consistent)
    const duplicates = await leadRepository()
      .createQueryBuilder("lead")
      .select("lead.phone", "phone")
      .addSelect("COUNT(*)", "count")
      .groupBy("lead.phone")
      .having("COUNT(*) > 1")
      .getRawMany();

    console.log(`Found ${duplicates.length} duplicate groups to merge`);

    let mergedCount = 0;
    let deletedCount = 0;
    const mergeLog: any[] = [];

    for (let i = 0; i < duplicates.length; i++) {
      const dup = duplicates[i];
      const phone = dup.phone;
      
      if ((i + 1) % 50 === 0) {
        console.log(`Processing duplicate group ${i + 1}/${duplicates.length}...`);
      }
      
      // Get all leads with this phone, ordered by creation date (oldest first)
      const leads = await leadRepository()
        .createQueryBuilder("lead")
        .where("lead.phone = :phone", { phone })
        .orderBy("lead.created_at", "ASC")
        .getMany();

      if (leads.length <= 1) continue;

      // Check each lead for assignment and activity
      const leadsWithDetails = await Promise.all(leads.map(async (lead) => {
        const activityCount = await activityRepository()
          .createQueryBuilder("activity")
          .where("activity.target_id = :leadId", { leadId: lead.id })
          .getCount();
        
        return {
          ...lead,
          activityCount,
          hasAssignment: !!lead.assigned_to,
          hasActivity: activityCount > 0 || lead.attempt_count > 0,
        };
      }));

      // Find the lead to keep based on user's logic:
      // If lead has assignment AND activity → keep it (merge others into it)
      // Otherwise → keep the newest one and assign to admin

      let leadToKeep = leadsWithDetails.find(l => l.hasAssignment && l.hasActivity);
      
      if (!leadToKeep) {
        // No lead has both assignment and activity - keep the newest one
        leadToKeep = leadsWithDetails[leadsWithDetails.length - 1]; // newest
        
        // Assign to admin if not already assigned
        if (!leadToKeep.assigned_to) {
          leadToKeep.assigned_to = adminUser.id;
          leadToKeep.assigned_name = adminUser.name;
        }
      }

      // Merge all other leads into leadToKeep
      const leadsToDelete = leadsWithDetails.filter(l => l.id !== leadToKeep!.id);
      
      // Combine notes from all leads
      let combinedNotes = leadToKeep.notes || '';
      for (const leadToMerge of leadsToDelete) {
        if (leadToMerge.notes) {
          combinedNotes += combinedNotes 
            ? `\n\n--- Merged from duplicate (${leadToMerge.name}) ---\n${leadToMerge.notes}`
            : leadToMerge.notes;
        }
        
        // Take the better email if current is empty
        if (!leadToKeep.email && leadToMerge.email) {
          leadToKeep.email = leadToMerge.email;
        }
        
        // Take the better city if current is empty
        if (!leadToKeep.city && leadToMerge.city) {
          leadToKeep.city = leadToMerge.city;
        }
        
        // Take higher attempt count
        if (leadToMerge.attempt_count > leadToKeep.attempt_count) {
          leadToKeep.attempt_count = leadToMerge.attempt_count;
        }
      }
      
      leadToKeep.notes = combinedNotes;
      leadToKeep.last_activity = new Date();
      
      // Save the merged lead (cast back to Lead for TypeORM)
      const leadEntity = leadRepository().create(leadToKeep);
      await leadRepository().save(leadEntity);
      
      // Delete the duplicate leads by ID
      const idsToDelete = leadsToDelete.map(l => l.id);
      if (idsToDelete.length > 0) {
        await leadRepository()
          .createQueryBuilder()
          .delete()
          .from(Lead)
          .whereInIds(idsToDelete)
          .execute();
        deletedCount += idsToDelete.length;
      }
      
      mergedCount++;
      // Only log first 20 to keep response size manageable
      if (mergeLog.length < 20) {
        mergeLog.push({
          phone,
          keptLeadId: leadToKeep.id,
          keptLeadName: leadToKeep.name,
          deletedCount: leadsToDelete.length,
          deletedLeadNames: leadsToDelete.map(l => l.name),
        });
      }
    }

    console.log(`Duplicate merge complete: ${mergedCount} groups merged, ${deletedCount} leads deleted`);

    // Log the activity
    await logActivity(
      adminUser.id,
      adminUser.name,
      "merged_all_duplicates",
      "bulk",
      "lead",
      `${mergedCount} duplicate groups`,
      `Merged ${mergedCount} duplicate groups, deleted ${deletedCount} duplicate leads`
    );

    res.json({
      message: `Successfully merged duplicates`,
      mergedGroups: mergedCount,
      deletedLeads: deletedCount,
      mergeLog,
    });
  } catch (error) {
    console.error("Merge all duplicates error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get lead by ID
router.get("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const leadId = req.params.id as string;
    const lead = await leadRepository().findOne({
      where: { id: leadId },
      relations: ["calls", "bookings"],
    });

    if (!lead) {
      return res.status(404).json({ detail: "Lead not found" });
    }

    res.json({
      ...lead,
      closed_reason_label: lead.closed_reason ? CLOSED_REASON_LABELS[lead.closed_reason] : null,
    });
  } catch (error) {
    console.error("Get lead error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Create lead with duplicate detection (Rule 3) - BLOCKS duplicates entirely
router.post("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, source, campaign, city, assigned_to, notes } = req.body;

    if (!name || !phone || !source) {
      return res.status(400).json({ detail: "Name, phone, and source are required" });
    }

    // Rule 3: Check for duplicates - ALWAYS block duplicates
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, "");
    let duplicateQuery = leadRepository().createQueryBuilder("lead");
    
    const conditions: string[] = [];
    const params: Record<string, any> = {};
    
    // Check phone
    conditions.push("REPLACE(REPLACE(REPLACE(REPLACE(lead.phone, ' ', ''), '-', ''), '(', ''), ')', '') = :phone");
    params.phone = normalizedPhone;
    
    // Check email if provided
    if (email) {
      conditions.push("LOWER(lead.email) = LOWER(:email)");
      params.email = email;
    }
    
    duplicateQuery = duplicateQuery.where(conditions.join(" OR "), params);
    const duplicates = await duplicateQuery.getMany();
    
    if (duplicates.length > 0) {
      const existingLead = duplicates[0];
      return res.status(409).json({
        detail: "Lead already exists with this phone number. Please contact Admin to access or reassign this lead.",
        duplicate: {
          id: existingLead.id,
          name: existingLead.name,
          phone: existingLead.phone,
          email: existingLead.email,
          status: existingLead.status,
          assigned_name: existingLead.assigned_name,
        },
      });
    }

    let assignedName: string | undefined;
    if (assigned_to) {
      const assignedUser = await userRepository().findOne({ where: { id: assigned_to } });
      if (assignedUser) {
        assignedName = assignedUser.name;
      }
    }

    const lead = leadRepository().create({
      id: uuidv4(),
      name,
      phone,
      email,
      source,
      campaign,
      city,
      assigned_to,
      assigned_name: assignedName,
      notes,
      status: LeadStatus.NEW,
      attempt_count: 0,
    });

    await leadRepository().save(lead);

    await logActivity(req.user!.id, req.user!.name, "created_lead", lead.id, "lead", name);

    res.status(201).json(lead);
  } catch (error) {
    console.error("Create lead error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Update lead with all rules validation
router.put("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const leadId = req.params.id as string;
    const lead = await leadRepository().findOne({ where: { id: leadId } });

    if (!lead) {
      return res.status(404).json({ detail: "Lead not found" });
    }

    const { name, phone, email, source, campaign, city, status, assigned_to, notes, next_followup, closed_reason, closed_reason_notes } = req.body;

    // Handle status change - require notes for any stage change
    if (status && status !== lead.status) {
      // NEW RULE: Notes are required for any stage change
      if (!notes && !lead.notes) {
        return res.status(400).json({ 
          detail: "Notes are required when changing lead status. Please add notes before changing the stage.",
          rule: "notes_required_for_stage_change"
        });
      }
    }

    // Apply updates
    if (name) lead.name = name;
    if (phone) lead.phone = phone;
    if (email !== undefined) lead.email = email;
    if (source) lead.source = source;
    if (campaign !== undefined) lead.campaign = campaign;
    if (city !== undefined) lead.city = city;
    if (status) lead.status = status;
    if (notes !== undefined) lead.notes = notes;
    if (next_followup !== undefined) lead.next_followup = next_followup ? new Date(next_followup) : undefined;
    if (closed_reason !== undefined) lead.closed_reason = closed_reason;
    if (closed_reason_notes !== undefined) lead.closed_reason_notes = closed_reason_notes;

    if (assigned_to !== undefined) {
      if (assigned_to) {
        const assignedUser = await userRepository().findOne({ where: { id: assigned_to } });
        if (assignedUser) {
          lead.assigned_to = assigned_to;
          lead.assigned_name = assignedUser.name;
        }
      } else {
        lead.assigned_to = undefined;
        lead.assigned_name = undefined;
      }
    }

    lead.last_activity = new Date();
    await leadRepository().save(lead);

    await logActivity(req.user!.id, req.user!.name, "updated_lead", lead.id, "lead", lead.name);

    res.json({
      ...lead,
      closed_reason_label: lead.closed_reason ? CLOSED_REASON_LABELS[lead.closed_reason] : null,
    });
  } catch (error) {
    console.error("Update lead error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Assign lead to user (single lead)
router.post("/:id/assign", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const leadId = req.params.id as string;
    const { assignee_id, assigned_to } = req.body;
    const userId = assignee_id || assigned_to;

    if (!userId) {
      return res.status(400).json({ detail: "assignee_id is required" });
    }

    const lead = await leadRepository().findOne({ where: { id: leadId } });
    if (!lead) {
      return res.status(404).json({ detail: "Lead not found" });
    }

    const assignedUser = await userRepository().findOne({ where: { id: userId } });
    if (!assignedUser) {
      return res.status(404).json({ detail: "User not found" });
    }

    lead.assigned_to = userId;
    lead.assigned_name = assignedUser.name;
    lead.last_activity = new Date();
    await leadRepository().save(lead);

    await logActivity(req.user!.id, req.user!.name, "assigned_lead", lead.id, "lead", lead.name, `Assigned to ${assignedUser.name}`);

    res.json(lead);
  } catch (error) {
    console.error("Assign lead error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Bulk assign leads
router.post("/bulk-assign", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req: AuthRequest, res: Response) => {
  try {
    const { lead_ids, assigned_to, assignee_id } = req.body;
    const userId = assigned_to || assignee_id;

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({ detail: "lead_ids array is required" });
    }

    if (!userId) {
      return res.status(400).json({ detail: "assigned_to or assignee_id is required" });
    }

    const assignedUser = await userRepository().findOne({ where: { id: userId } });
    if (!assignedUser) {
      return res.status(404).json({ detail: "Assigned user not found" });
    }

    await leadRepository()
      .createQueryBuilder()
      .update(Lead)
      .set({
        assigned_to: userId,
        assigned_name: assignedUser.name,
        last_activity: new Date(),
      })
      .whereInIds(lead_ids)
      .execute();

    res.json({ message: `${lead_ids.length} leads assigned to ${assignedUser.name}` });
  } catch (error) {
    console.error("Bulk assign error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Bulk update status - simplified rules (only notes required)
router.post("/bulk-status", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req: AuthRequest, res: Response) => {
  try {
    const { lead_ids, status, notes } = req.body;

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({ detail: "lead_ids array is required" });
    }

    if (!status) {
      return res.status(400).json({ detail: "status is required" });
    }

    // Notes are required for bulk status change
    if (!notes) {
      return res.status(400).json({ 
        detail: "Notes are required when changing lead status in bulk",
        rule: "notes_required_for_stage_change"
      });
    }

    const newStatus = status as LeadStatus;

    // Update all leads - no stage transition restrictions
    const updateData: Partial<Lead> = {
      status: newStatus,
      notes: notes,
      last_activity: new Date(),
    };

    await leadRepository()
      .createQueryBuilder()
      .update(Lead)
      .set(updateData)
      .whereInIds(lead_ids)
      .execute();

    res.json({ 
      message: `${lead_ids.length} leads updated to ${status}`,
      updated: lead_ids.length,
    });
  } catch (error) {
    console.error("Bulk status error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Bulk import leads with duplicate detection (supports file upload)
router.post("/import", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    let leadsData: any[] = [];

    // Check if file was uploaded
    if (req.file) {
      // Read with UTF-8 encoding support for Hindi and other languages
      const workbook = XLSX.read(req.file.buffer, { 
        type: 'buffer',
        codepage: 65001, // UTF-8
        raw: false,
      });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
      
      // Map the data to expected format - handle various column name formats
      leadsData = jsonData.map((row: any) => ({
        name: String(row.name || row.Name || row.NAME || row['नाम'] || '').trim(),
        phone: String(row.phone || row.Phone || row.PHONE || row['फ़ोन'] || row['मोबाइल'] || '').trim(),
        email: String(row.email || row.Email || row.EMAIL || row['ईमेल'] || '').trim(),
        source: String(row.source || row.Source || row.SOURCE || row['स्रोत'] || 'Import').trim(),
        campaign: String(row.campaign || row.Campaign || row.CAMPAIGN || row['अभियान'] || '').trim(),
        city: String(row.city || row.City || row.CITY || row['शहर'] || '').trim(),
        notes: String(row.notes || row.Notes || row.NOTES || row['नोट्स'] || '').trim(),
      }));
    } else if (req.body.leads) {
      // Handle JSON array input
      leadsData = req.body.leads;
    } else {
      return res.status(400).json({ detail: "No file uploaded or leads array provided" });
    }

    if (leadsData.length === 0) {
      return res.status(400).json({ detail: "No valid leads found in the file" });
    }

    console.log(`Processing import of ${leadsData.length} leads...`);

    // OPTIMIZATION: Fetch ALL existing phone numbers in one query
    const existingLeads = await leadRepository()
      .createQueryBuilder("lead")
      .select(["lead.phone", "lead.email", "lead.id", "lead.name"])
      .getMany();

    // Create a Set of normalized phone numbers for O(1) lookup
    const existingPhones = new Set<string>();
    const existingEmails = new Set<string>();
    const existingLeadMap = new Map<string, { id: string; name: string; phone: string }>();

    for (const lead of existingLeads) {
      const normalizedPhone = String(lead.phone).replace(/[\s\-\(\)]/g, "");
      existingPhones.add(normalizedPhone);
      existingLeadMap.set(normalizedPhone, { id: lead.id, name: lead.name, phone: lead.phone });
      if (lead.email) {
        existingEmails.add(lead.email.toLowerCase());
      }
    }

    const leadsToCreate: Lead[] = [];
    const duplicates: { data: any; existingLead: any }[] = [];
    const errors: string[] = [];

    // Process leads without individual DB queries
    for (const data of leadsData) {
      if (!data.name || !data.phone) {
        errors.push(`Row missing name or phone: ${JSON.stringify(data).substring(0, 100)}`);
        continue;
      }

      const normalizedPhone = String(data.phone).replace(/[\s\-\(\)]/g, "");
      
      // Check for duplicates using in-memory Sets (O(1) lookup)
      if (existingPhones.has(normalizedPhone)) {
        const existingLead = existingLeadMap.get(normalizedPhone);
        duplicates.push({ data, existingLead });
        continue;
      }

      if (data.email && existingEmails.has(data.email.toLowerCase())) {
        duplicates.push({ data, existingLead: { phone: 'N/A', name: 'Email match' } });
        continue;
      }

      // Also check if this phone already exists in the batch being imported (prevent self-duplicates)
      if (leadsToCreate.some(l => String(l.phone).replace(/[\s\-\(\)]/g, "") === normalizedPhone)) {
        duplicates.push({ data, existingLead: { phone: data.phone, name: 'Duplicate in file' } });
        continue;
      }

      const lead = leadRepository().create({
        id: uuidv4(),
        name: data.name,
        phone: String(data.phone),
        email: data.email || null,
        source: data.source || 'Import',
        campaign: data.campaign || null,
        city: data.city || null,
        notes: data.notes || null,
        status: LeadStatus.NEW,
        attempt_count: 0,
      });

      leadsToCreate.push(lead);
      // Add to existing sets to prevent duplicates within the import batch
      existingPhones.add(normalizedPhone);
      if (data.email) {
        existingEmails.add(data.email.toLowerCase());
      }
    }

    // OPTIMIZATION: Bulk insert in larger batches using query builder for speed
    const BATCH_SIZE = 500;
    let importedCount = 0;

    for (let i = 0; i < leadsToCreate.length; i += BATCH_SIZE) {
      const batch = leadsToCreate.slice(i, i + BATCH_SIZE);
      
      // Use insert instead of save for faster bulk inserts
      await leadRepository()
        .createQueryBuilder()
        .insert()
        .into(Lead)
        .values(batch)
        .execute();
      
      importedCount += batch.length;
      console.log(`Imported batch ${Math.floor(i / BATCH_SIZE) + 1}: ${importedCount}/${leadsToCreate.length} leads`);
    }

    await logActivity(req.user!.id, req.user!.name, "imported_leads", "bulk", "lead", `${importedCount} leads`, `Imported ${importedCount} leads from file`);

    console.log(`Import complete: ${importedCount} imported, ${duplicates.length} duplicates skipped`);

    res.status(201).json({ 
      imported: importedCount, 
      skipped: duplicates.length,
      duplicates: duplicates.length,
      errors: errors,
      leads: leadsToCreate.slice(0, 10), // Return first 10 for preview
      duplicateDetails: duplicates.length > 0 ? duplicates.slice(0, 10) : undefined,
    });
  } catch (error: any) {
    console.error("Import leads error:", error);
    res.status(500).json({ detail: error.message || "Internal server error" });
  }
});

// Delete lead (Admin only)
router.delete("/:id", authenticateToken, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const leadId = req.params.id as string;
    const lead = await leadRepository().findOne({ where: { id: leadId } });

    if (!lead) {
      return res.status(404).json({ detail: "Lead not found" });
    }

    await leadRepository().remove(lead);
    res.json({ message: "Lead deleted successfully" });
  } catch (error) {
    console.error("Delete lead error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Bulk delete leads (Admin and Manager)
router.post("/bulk-delete", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const { lead_ids } = req.body;

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({ detail: "lead_ids array is required" });
    }

    await leadRepository()
      .createQueryBuilder()
      .delete()
      .from(Lead)
      .whereInIds(lead_ids)
      .execute();

    await logActivity(req.user!.id, req.user!.name, "bulk_deleted_leads", "bulk", "lead", `${lead_ids.length} leads`, `Deleted ${lead_ids.length} leads`);

    res.json({ message: `${lead_ids.length} leads deleted successfully` });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Bulk update status (alias for bulk-status)
router.post("/bulk-update-status", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req: AuthRequest, res: Response) => {
  try {
    const { lead_ids, status, closed_reason } = req.body;

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({ detail: "lead_ids array is required" });
    }

    if (!status) {
      return res.status(400).json({ detail: "status is required" });
    }

    const newStatus = status as LeadStatus;

    // Rule 2: Check if closed reason is required
    if (STAGES_REQUIRING_REASON.includes(newStatus) && !closed_reason) {
      return res.status(400).json({ 
        detail: `A reason must be provided when marking leads as ${newStatus}`,
        rule: "closed_reason_required"
      });
    }

    const updateData: Partial<Lead> = {
      status: newStatus,
      last_activity: new Date(),
    };

    if (closed_reason) {
      updateData.closed_reason = closed_reason;
    }

    await leadRepository()
      .createQueryBuilder()
      .update(Lead)
      .set(updateData)
      .whereInIds(lead_ids)
      .execute();

    res.json({ message: `${lead_ids.length} leads updated to ${status}` });
  } catch (error) {
    console.error("Bulk update status error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
