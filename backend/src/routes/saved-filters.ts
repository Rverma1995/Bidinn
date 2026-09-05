import { Router, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { SavedFilter } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";
import {
  MAX_SAVED_FILTERS_PER_USER,
  sanitizeLeadFilterJson,
  sanitizeSavedFilterName,
} from "../utils/saved-filters";

const router = Router();

const savedFilterRepository = () => AppDataSource.getRepository(SavedFilter);

router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const filters = await savedFilterRepository().find({
      where: { user_id: req.user!.id },
      order: { created_at: "DESC" },
    });
    res.json(filters);
  } catch (error) {
    console.error("Get saved filters error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

router.post("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const name = sanitizeSavedFilterName(req.body?.name);
    if (!name) {
      return res.status(400).json({ detail: "Name is required" });
    }

    const count = await savedFilterRepository().count({ where: { user_id: req.user!.id } });
    if (count >= MAX_SAVED_FILTERS_PER_USER) {
      return res.status(400).json({
        detail: `You can save up to ${MAX_SAVED_FILTERS_PER_USER} filters`,
      });
    }

    const saved = savedFilterRepository().create({
      id: uuidv4(),
      user_id: req.user!.id,
      name,
      filter_json: sanitizeLeadFilterJson(req.body?.filter_json),
    });
    await savedFilterRepository().save(saved);
    res.status(201).json(saved);
  } catch (error) {
    console.error("Create saved filter error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

router.delete("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const saved = await savedFilterRepository().findOne({
      where: { id: req.params.id as string, user_id: req.user!.id },
    });
    if (!saved) {
      return res.status(404).json({ detail: "Saved filter not found" });
    }
    await savedFilterRepository().remove(saved);
    res.json({ message: "Saved filter deleted" });
  } catch (error) {
    console.error("Delete saved filter error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
