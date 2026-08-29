import { Router, Response } from "express";
import { cacheMiddleware, invalidateCacheMiddleware } from "../middleware/cache";
import { CACHE_KEYS, CACHE_TTL } from "../config/cache.constants";
import { AppDataSource } from "../config/data-source";
import { Call, CallOutcome, Lead } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";
import { canAccessLead, isSalesRep } from "../utils/lead-scope";
import { applyCallCompletion } from "../services/call-log.service";

const router = Router();

// Automatically invalidate caches on any successful mutation in this router
router.use(invalidateCacheMiddleware([CACHE_KEYS.CALLS_LIST, CACHE_KEYS.DASHBOARD_STATS, CACHE_KEYS.LEADS_LIST]));

const callRepository = () => AppDataSource.getRepository(Call);
const leadRepository = () => AppDataSource.getRepository(Lead);

// Get calls for a lead
router.get("/lead/:leadId", authenticateToken, cacheMiddleware(CACHE_KEYS.CALLS_LIST, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const leadId = req.params.leadId as string;
    const lead = await leadRepository().findOne({ where: { id: leadId } });
    if (!lead) {
      return res.status(404).json({ detail: "Lead not found" });
    }
    if (!canAccessLead(lead, req.user!)) {
      return res.status(403).json({ detail: "You can only view calls for leads assigned to you" });
    }

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
    if (!canAccessLead(lead, req.user!)) {
      return res.status(403).json({ detail: "You can only log calls on leads assigned to you" });
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

    await applyCallCompletion({
      lead,
      userId: req.user!.id,
      userName: req.user!.name,
      outcome: outcome as CallOutcome,
      nextFollowup: next_followup ? new Date(next_followup) : undefined,
    });

    res.status(201).json(call);
  } catch (error) {
    console.error("Create call error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get all calls (for reports)
router.get("/", authenticateToken, cacheMiddleware(CACHE_KEYS.CALLS_LIST, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const leadId = req.query.lead_id as string | undefined;
    if (leadId) {
      const lead = await leadRepository().findOne({ where: { id: leadId } });
      if (!lead) {
        return res.status(404).json({ detail: "Lead not found" });
      }
      if (!canAccessLead(lead, req.user!)) {
        return res.status(403).json({ detail: "You can only view calls for leads assigned to you" });
      }
      const calls = await callRepository().find({
        where: { lead_id: leadId },
        order: { created_at: "DESC" },
      });
      return res.json(calls);
    }

    const query = callRepository().createQueryBuilder("call");
    if (isSalesRep(req.user)) {
      query.innerJoin(Lead, "lead", "lead.id = call.lead_id")
        .andWhere("lead.assigned_to = :salesRepScopeId", { salesRepScopeId: req.user!.id });
    }
    const calls = await query.orderBy("call.created_at", "DESC").take(100).getMany();
    res.json(calls);
  } catch (error) {
    console.error("Get all calls error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
