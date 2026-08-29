import { Router, Request, Response } from "express";
import { cacheMiddleware, invalidateCacheMiddleware } from "../middleware/cache";
import { CACHE_KEYS, CACHE_TTL } from "../config/cache.constants";
import { AppDataSource } from "../config/data-source";
import { Call, Lead, User } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { canAccessLead } from "../utils/lead-scope";
import { initiateClickToCall, upsertTataWebhookEvent, verifyTataWebhookSignature } from "../services/tata.service";
import { TataWebhookPayload } from "../services/tata-webhook";

const router = Router();

router.use(invalidateCacheMiddleware([CACHE_KEYS.CALLS_LIST, CACHE_KEYS.DASHBOARD_STATS, CACHE_KEYS.LEADS_LIST, CACHE_KEYS.ACTIVITIES_LIST, CACHE_KEYS.NOTIFICATIONS_LIST]));

const callRepository = () => AppDataSource.getRepository(Call);
const leadRepository = () => AppDataSource.getRepository(Lead);
const userRepository = () => AppDataSource.getRepository(User);

router.post("/click-to-call", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { lead_id } = req.body;
    if (!lead_id) {
      return res.status(400).json({ detail: "lead_id is required" });
    }

    const lead = await leadRepository().findOne({ where: { id: lead_id } });
    if (!lead) {
      return res.status(404).json({ detail: "Lead not found" });
    }
    if (!canAccessLead(lead, req.user!)) {
      return res.status(403).json({ detail: "You can only call leads assigned to you" });
    }

    const user = await userRepository().findOne({ where: { id: req.user!.id } });
    if (!user) {
      return res.status(401).json({ detail: "User not found" });
    }

    const result = await initiateClickToCall({ lead, user });
    res.json({
      success: true,
      call_id: result.call_id,
      call: result.call,
      mock: result.mock,
      message: "Call initiated",
    });
  } catch (error: any) {
    console.error("Click to call error:", error);
    const status = error.status || 500;
    res.status(status).json({ detail: error.message || "Failed to initiate call" });
  }
});

router.post("/webhook", async (req: Request & { rawBody?: Buffer }, res: Response) => {
  try {
    const signature =
      (req.headers["x-smartflo-signature"] as string) ||
      (req.body && req.body.signature);

    if (process.env.TATA_SMARTFLO_WEBHOOK_SECRET) {
      const bodyToVerify = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
      if (!verifyTataWebhookSignature(bodyToVerify, signature)) {
        console.warn("Invalid Tata webhook signature");
        return res.status(403).json({ detail: "Invalid signature" });
      }
    }

    const payload = req.body as TataWebhookPayload;
    if (!payload?.event || !payload?.data?.call_id) {
      return res.status(400).json({ detail: "event and data.call_id are required" });
    }

    const call = await upsertTataWebhookEvent(payload);
    res.json({ received: true, call_id: call.tata_call_id, id: call.id });
  } catch (error) {
    console.error("Tata webhook error:", error);
    res.status(500).json({ detail: "Webhook processing failed" });
  }
});

router.get("/calls/:lead_id", authenticateToken, cacheMiddleware(CACHE_KEYS.CALLS_LIST, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const leadId = req.params.lead_id as string;
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
      take: 50,
    });
    res.json(calls);
  } catch (error) {
    console.error("Get Tata calls error:", error);
    res.status(500).json({ detail: "Failed to fetch calls" });
  }
});

export default router;
