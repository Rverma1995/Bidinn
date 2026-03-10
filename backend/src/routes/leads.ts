import { Router, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Lead, LeadStatus, User, UserRole, Activity } from "../entities";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();
const leadRepository = () => AppDataSource.getRepository(Lead);
const userRepository = () => AppDataSource.getRepository(User);
const activityRepository = () => AppDataSource.getRepository(Activity);

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
      };
    });

    res.json(enrichedLeads);
  } catch (error) {
    console.error("Get leads error:", error);
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

    res.json(lead);
  } catch (error) {
    console.error("Get lead error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Create lead
router.post("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, source, campaign, city, assigned_to, notes } = req.body;

    if (!name || !phone || !source) {
      return res.status(400).json({ detail: "Name, phone, and source are required" });
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

// Update lead
router.put("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const leadId = req.params.id as string;
    const lead = await leadRepository().findOne({ where: { id: leadId } });

    if (!lead) {
      return res.status(404).json({ detail: "Lead not found" });
    }

    const { name, phone, email, source, campaign, city, status, assigned_to, notes, next_followup } = req.body;

    if (name) lead.name = name;
    if (phone) lead.phone = phone;
    if (email !== undefined) lead.email = email;
    if (source) lead.source = source;
    if (campaign !== undefined) lead.campaign = campaign;
    if (city !== undefined) lead.city = city;
    if (status) lead.status = status;
    if (notes !== undefined) lead.notes = notes;
    if (next_followup !== undefined) lead.next_followup = next_followup ? new Date(next_followup) : undefined;

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

    res.json(lead);
  } catch (error) {
    console.error("Update lead error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Bulk assign leads
router.post("/bulk-assign", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req: AuthRequest, res: Response) => {
  try {
    const { lead_ids, assigned_to } = req.body;

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({ detail: "lead_ids array is required" });
    }

    if (!assigned_to) {
      return res.status(400).json({ detail: "assigned_to is required" });
    }

    const assignedUser = await userRepository().findOne({ where: { id: assigned_to } });
    if (!assignedUser) {
      return res.status(404).json({ detail: "Assigned user not found" });
    }

    await leadRepository()
      .createQueryBuilder()
      .update(Lead)
      .set({
        assigned_to: assigned_to,
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

// Bulk update status
router.post("/bulk-status", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]), async (req: AuthRequest, res: Response) => {
  try {
    const { lead_ids, status } = req.body;

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return res.status(400).json({ detail: "lead_ids array is required" });
    }

    if (!status) {
      return res.status(400).json({ detail: "status is required" });
    }

    await leadRepository()
      .createQueryBuilder()
      .update(Lead)
      .set({
        status: status,
        last_activity: new Date(),
      })
      .whereInIds(lead_ids)
      .execute();

    res.json({ message: `${lead_ids.length} leads updated to ${status}` });
  } catch (error) {
    console.error("Bulk status error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Export leads as CSV
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

// Bulk import leads
router.post("/import", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const { leads: leadsData } = req.body;

    if (!leadsData || !Array.isArray(leadsData)) {
      return res.status(400).json({ detail: "leads array is required" });
    }

    const createdLeads: Lead[] = [];
    for (const data of leadsData) {
      if (!data.name || !data.phone || !data.source) {
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

    res.status(201).json({ imported: createdLeads.length, leads: createdLeads });
  } catch (error) {
    console.error("Import leads error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Delete lead
router.delete("/:id", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
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

export default router;
