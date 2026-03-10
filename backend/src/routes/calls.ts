import { Router, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Call, CallOutcome, Lead, Activity } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();
const callRepository = () => AppDataSource.getRepository(Call);
const leadRepository = () => AppDataSource.getRepository(Lead);
const activityRepository = () => AppDataSource.getRepository(Activity);

// Get calls for a lead
router.get("/lead/:leadId", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const leadId = req.params.leadId as string;
    const calls = await callRepository().find({
      where: { lead_id: leadId },
      order: { created_at: "DESC" },
    });
    res.json(calls);
  } catch (error) {
    console.error("Get calls error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Create call log
router.post("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { lead_id, outcome, duration_minutes, notes, next_followup } = req.body;

    if (!lead_id || !outcome) {
      return res.status(400).json({ detail: "lead_id and outcome are required" });
    }

    const lead = await leadRepository().findOne({ where: { id: lead_id } });
    if (!lead) {
      return res.status(404).json({ detail: "Lead not found" });
    }

    const call = callRepository().create({
      id: uuidv4(),
      lead_id,
      user_id: req.user!.id,
      user_name: req.user!.name,
      outcome: outcome as CallOutcome,
      duration_minutes: duration_minutes || 0,
      notes,
      next_followup: next_followup ? new Date(next_followup) : undefined,
    });

    await callRepository().save(call);

    // Update lead
    lead.attempt_count = (lead.attempt_count || 0) + 1;
    lead.last_activity = new Date();
    if (next_followup) {
      lead.next_followup = new Date(next_followup);
    }
    await leadRepository().save(lead);

    // Log activity
    const activity = activityRepository().create({
      id: uuidv4(),
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: "logged_call",
      target_id: lead_id,
      target_type: "lead",
      target_name: lead.name,
      details: `Outcome: ${outcome}`,
    });
    await activityRepository().save(activity);

    res.status(201).json(call);
  } catch (error) {
    console.error("Create call error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get all calls (for reports)
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const calls = await callRepository().find({
      order: { created_at: "DESC" },
      take: 100,
    });
    res.json(calls);
  } catch (error) {
    console.error("Get all calls error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
