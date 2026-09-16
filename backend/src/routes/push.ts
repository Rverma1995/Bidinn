import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AppDataSource } from "../config/data-source";
import { PushSubscription } from "../entities/PushSubscription";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { getVapidPublicKey, isWebPushConfigured } from "../services/web-push.service";

const router = Router();

const subscriptionRepository = () => AppDataSource.getRepository(PushSubscription);

router.get("/vapid-public-key", (req, res: Response) => {
  const publicKey = getVapidPublicKey();
  res.json({
    enabled: isWebPushConfigured() && Boolean(publicKey),
    publicKey,
  });
});

router.post("/subscribe", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!isWebPushConfigured()) {
      res.status(503).json({ detail: "Web Push is not configured on this server" });
      return;
    }

    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
    const p256dh = typeof req.body?.keys?.p256dh === "string" ? req.body.keys.p256dh : "";
    const auth = typeof req.body?.keys?.auth === "string" ? req.body.keys.auth : "";

    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ detail: "Invalid push subscription" });
      return;
    }

    if (endpoint.length > 768) {
      res.status(400).json({ detail: "Push endpoint is too long" });
      return;
    }

    const user = req.user!;
    const repo = subscriptionRepository();
    const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"].slice(0, 512) : null;

    let subscription = await repo.findOne({ where: { endpoint } });
    if (subscription) {
      subscription.user_id = user.id;
      subscription.p256dh = p256dh;
      subscription.auth = auth;
      subscription.user_agent = userAgent;
    } else {
      subscription = repo.create({
        id: uuidv4(),
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
      });
    }

    await repo.save(subscription);
    res.json({ ok: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    res.status(500).json({ detail: "Failed to save push subscription" });
  }
});

router.delete("/subscribe", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const fromBody = typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
    const fromQuery = typeof req.query.endpoint === "string" ? req.query.endpoint : "";
    const endpoint = (fromBody || fromQuery).trim();
    if (!endpoint) {
      res.status(400).json({ detail: "endpoint is required" });
      return;
    }

    await subscriptionRepository().delete({ endpoint, user_id: req.user!.id });
    res.json({ ok: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    res.status(500).json({ detail: "Failed to remove push subscription" });
  }
});

export default router;
