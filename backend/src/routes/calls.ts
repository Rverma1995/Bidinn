import { Router, Response } from "express";
import { cacheMiddleware, invalidateCacheMiddleware } from "../middleware/cache";
import { CACHE_KEYS, CACHE_TTL } from "../config/cache.constants";
import { AppDataSource } from "../config/data-source";
import { Call, CallOutcome, Lead } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";
import { canAccessLead, isSalesRep } from "../utils/lead-scope";
import { applyCallCompletion } from "../services/call-log.service";
import { completeCallWrapUp } from "../services/call-wrap-up.service";
import { syncPendingTataCallsForLead } from "../services/tata.service";

const router = Router();

// Automatically invalidate caches on any successful mutation in this router
router.use(invalidateCacheMiddleware([CACHE_KEYS.CALLS_LIST, CACHE_KEYS.DASHBOARD_STATS, CACHE_KEYS.LEADS_LIST, CACHE_KEYS.ACTIVITIES_LIST]));

const callRepository = () => AppDataSource.getRepository(Call);
const leadRepository = () => AppDataSource.getRepository(Lead);

// Get calls for a lead
router.get("/lead/:leadId", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const leadId = req.params.leadId as string;
    const lead = await leadRepository().findOne({ where: { id: leadId } });
    if (!lead) {
      return res.status(404).json({ detail: "Lead not found" });
    }
    if (!canAccessLead(lead, req.user!)) {
      return res.status(403).json({ detail: "You can only view calls for leads assigned to you" });
    }

    await syncPendingTataCallsForLead(leadId).catch((err) => {
      console.warn("Pending Tata call sync failed:", err);
    });

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
      wrap_up_completed: true,
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

// Get single call (for telephony wrap-up polling)
router.get("/:id", authenticateToken, cacheMiddleware(CACHE_KEYS.CALLS_LIST, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const call = await callRepository().findOne({ where: { id: req.params.id as string } });
    if (!call) {
      return res.status(404).json({ detail: "Call not found" });
    }

    if (call.lead_id) {
      const lead = await leadRepository().findOne({ where: { id: call.lead_id } });
      if (!lead) {
        return res.status(404).json({ detail: "Lead not found" });
      }
      if (!canAccessLead(lead, req.user!)) {
        return res.status(403).json({ detail: "You can only view calls for leads assigned to you" });
      }
    } else if (call.user_id !== req.user!.id && req.user!.role !== "admin") {
      return res.status(403).json({ detail: "You can only view your own calls" });
    }

    res.json(call);
  } catch (error) {
    console.error("Get call error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Complete agent wrap-up after a connected call ends
router.patch("/:id/wrap-up", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await completeCallWrapUp(req.params.id as string, req.user!, req.body);
    res.json(result);
  } catch (error: any) {
    console.error("Call wrap-up error:", error);
    const status = error.status || 500;
    res.status(status).json({
      detail: error.message || "Failed to complete call wrap-up",
      rule: error.rule,
    });
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
