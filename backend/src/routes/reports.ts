import { Router, Response } from "express";
import { cacheMiddleware } from "../middleware/cache";
import { CACHE_KEYS, CACHE_TTL } from "../config/cache.constants";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import {
  DailyActivityRange,
  getDailyActivityReport,
} from "../services/daily-activity-report.service";

const router = Router();

/**
 * Daily Activity Report — aggregated metrics for dashboard.
 *
 * Role scoping:
 * - admin: org-wide (all agents / all assigned leads)
 * - manager, team_lead, sales_rep: only their own assigned leads and call logs
 *
 * Query: range=today|week|month|year
 */
router.get(
  "/daily",
  authenticateToken,
  cacheMiddleware(CACHE_KEYS.DASHBOARD_STATS, CACHE_TTL.TIME_SENSITIVE),
  async (req: AuthRequest, res: Response) => {
    try {
      const range = req.query.range as string;
      const validRanges: DailyActivityRange[] = ["today", "week", "month", "year"];

      if (!validRanges.includes(range as DailyActivityRange)) {
        res.status(400).json({
          detail: "Invalid range. Must be one of: today, week, month, year",
        });
        return;
      }

      res.json(await getDailyActivityReport(req.user!, range as DailyActivityRange));
    } catch (error) {
      console.error("Get daily activity report error:", error);
      res.status(500).json({ detail: "Internal server error" });
    }
  }
);

export default router;
