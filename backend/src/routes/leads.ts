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

// Get all leads
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let queryBuilder = leadRepository().createQueryBuilder("lead");

    // Sales reps only see their assigned leads
    if (user.role === UserRole.SALES_REP) {
      queryBuilder = queryBuilder.where("lead.assigned_to = :userId", { userId: user.id });
    }

    queryBuilder = queryBuilder.orderBy("lead.created_at", "DESC");

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

    res.json(enrichedLeads);
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

// Create lead with duplicate detection (Rule 3)
router.post("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, source, campaign, city, assigned_to, notes, force_create } = req.body;

    if (!name || !phone || !source) {
      return res.status(400).json({ detail: "Name, phone, and source are required" });
    }

    // Rule 3: Check for duplicates if not forcing creation
    if (!force_create) {
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
        return res.status(409).json({
          detail: "Duplicate lead detected",
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
      }
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

    // Handle status change validations
    if (status && status !== lead.status) {
      const currentStatus = lead.status as LeadStatus;
      const newStatus = status as LeadStatus;
      
      // Rule 5: Check if transition is allowed
      const allowedTransitions = STAGE_TRANSITIONS[currentStatus];
      if (allowedTransitions && !allowedTransitions.includes(newStatus)) {
        // Special message for interested/followup -> not_interested transition
        if ((currentStatus === LeadStatus.INTERESTED || currentStatus === LeadStatus.FOLLOWUP) && 
            newStatus === LeadStatus.NOT_INTERESTED) {
          return res.status(400).json({ 
            detail: "Cannot move directly from Interested/Follow-up to Not Interested. Please mark as Won or Lost first.",
            rule: "stage_transition_restriction"
          });
        }
        return res.status(400).json({ 
          detail: `Invalid status transition from ${currentStatus} to ${newStatus}`,
          rule: "stage_transition"
        });
      }

      // Rule 1: Check assignment requirement
      if (STAGES_REQUIRING_ASSIGNMENT.includes(newStatus)) {
        const effectiveAssignedTo = assigned_to !== undefined ? assigned_to : lead.assigned_to;
        if (!effectiveAssignedTo) {
          return res.status(400).json({ 
            detail: `Lead must be assigned to a salesperson before moving to ${newStatus} status`,
            rule: "assignment_required"
          });
        }
      }

      // Rule 2: Check closed reason requirement
      if (STAGES_REQUIRING_REASON.includes(newStatus)) {
        if (!closed_reason) {
          return res.status(400).json({ 
            detail: `A reason must be provided when marking a lead as ${newStatus}`,
            rule: "closed_reason_required",
            available_reasons: Object.entries(CLOSED_REASON_LABELS).map(([value, label]) => ({ value, label }))
          });
        }
        // Validate the closed reason value
        if (!Object.keys(CLOSED_REASON_LABELS).includes(closed_reason)) {
          return res.status(400).json({ 
            detail: "Invalid closed reason provided",
            rule: "invalid_closed_reason"
          });
        }
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

// Bulk update status with rules validation
router.post("/bulk-status", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req: AuthRequest, res: Response) => {
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
        rule: "closed_reason_required",
        available_reasons: Object.entries(CLOSED_REASON_LABELS).map(([value, label]) => ({ value, label }))
      });
    }

    // Get all leads to validate transitions
    const leads = await leadRepository().find({ where: { id: In(lead_ids) } });
    
    const invalidLeads: { id: string; name: string; currentStatus: string; reason: string }[] = [];
    const validLeadIds: string[] = [];

    for (const lead of leads) {
      const currentStatus = lead.status as LeadStatus;
      const allowedTransitions = STAGE_TRANSITIONS[currentStatus];
      
      // Rule 5: Check transition validity
      if (allowedTransitions && !allowedTransitions.includes(newStatus)) {
        invalidLeads.push({
          id: lead.id,
          name: lead.name,
          currentStatus: lead.status,
          reason: `Cannot transition from ${currentStatus} to ${newStatus}`,
        });
        continue;
      }

      // Rule 1: Check assignment requirement
      if (STAGES_REQUIRING_ASSIGNMENT.includes(newStatus) && !lead.assigned_to) {
        invalidLeads.push({
          id: lead.id,
          name: lead.name,
          currentStatus: lead.status,
          reason: "Lead must be assigned before moving to this status",
        });
        continue;
      }

      validLeadIds.push(lead.id);
    }

    // Update valid leads
    if (validLeadIds.length > 0) {
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
        .whereInIds(validLeadIds)
        .execute();
    }

    res.json({ 
      message: `${validLeadIds.length} leads updated to ${status}`,
      updated: validLeadIds.length,
      failed: invalidLeads.length,
      invalidLeads: invalidLeads.length > 0 ? invalidLeads : undefined,
    });
  } catch (error) {
    console.error("Bulk status error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Bulk import leads with duplicate detection
router.post("/import", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const { leads: leadsData } = req.body;

    if (!leadsData || !Array.isArray(leadsData)) {
      return res.status(400).json({ detail: "leads array is required" });
    }

    const createdLeads: Lead[] = [];
    const duplicates: { data: any; existingLead: any }[] = [];
    const errors: { data: any; error: string }[] = [];

    for (const data of leadsData) {
      if (!data.name || !data.phone || !data.source) {
        errors.push({ data, error: "Missing required fields (name, phone, source)" });
        continue;
      }

      // Check for duplicates
      const normalizedPhone = data.phone.replace(/[\s\-\(\)]/g, "");
      let duplicateQuery = leadRepository().createQueryBuilder("lead")
        .where("REPLACE(REPLACE(REPLACE(REPLACE(lead.phone, ' ', ''), '-', ''), '(', ''), ')', '') = :phone", { phone: normalizedPhone });
      
      if (data.email) {
        duplicateQuery = duplicateQuery.orWhere("LOWER(lead.email) = LOWER(:email)", { email: data.email });
      }
      
      const existingLead = await duplicateQuery.getOne();
      
      if (existingLead) {
        duplicates.push({ data, existingLead });
        continue;
      }

      const lead = leadRepository().create({
        id: uuidv4(),
        name: data.name,
        phone: data.phone,
        email: data.email,
        source: data.source,
        campaign: data.campaign,
        city: data.city,
        status: LeadStatus.NEW,
        attempt_count: 0,
      });

      await leadRepository().save(lead);
      createdLeads.push(lead);
    }

    res.status(201).json({ 
      imported: createdLeads.length, 
      duplicates: duplicates.length,
      errors: errors.length,
      leads: createdLeads,
      duplicateDetails: duplicates.length > 0 ? duplicates : undefined,
      errorDetails: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Import leads error:", error);
    res.status(500).json({ detail: "Internal server error" });
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

// Bulk delete leads (Admin only)
router.post("/bulk-delete", authenticateToken, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
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
