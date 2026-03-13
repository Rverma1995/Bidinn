import { Router, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Activity } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();
const activityRepository = () => AppDataSource.getRepository(Activity);

// Get all activities
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    
    const activities = await activityRepository().find({
      order: { created_at: "DESC" },
      take: limit,
    });
    
    res.json(activities);
  } catch (error) {
    console.error("Get activities error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get activities for a specific target (limited to prevent performance issues)
router.get("/target/:targetId", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const targetId = req.params.targetId as string;
    const activities = await activityRepository().find({
      where: { target_id: targetId },
      order: { created_at: "DESC" },
      take: 100, // Limit to most recent 100 activities
    });
    
    res.json(activities);
  } catch (error) {
    console.error("Get target activities error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
