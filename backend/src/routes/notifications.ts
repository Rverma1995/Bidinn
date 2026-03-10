import { Router, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Notification, UserRole } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();
const notificationRepository = () => AppDataSource.getRepository(Notification);

// Get notifications for current user
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { unread_only, limit = "50" } = req.query;

    let queryBuilder = notificationRepository()
      .createQueryBuilder("notification")
      .where("notification.user_id = :userId", { userId: user.id });

    if (unread_only === "true") {
      queryBuilder = queryBuilder.andWhere("notification.is_read = false");
    }

    queryBuilder = queryBuilder
      .orderBy("notification.created_at", "DESC")
      .take(parseInt(limit as string));

    const notifications = await queryBuilder.getMany();
    
    // Get unread count
    const unreadCount = await notificationRepository().count({
      where: { user_id: user.id, is_read: false }
    });

    res.json({
      notifications,
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Mark notification as read
router.put("/:id/read", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const notificationId = req.params.id as string;
    const user = req.user!;

    const notification = await notificationRepository().findOne({
      where: { id: notificationId, user_id: user.id }
    });

    if (!notification) {
      return res.status(404).json({ detail: "Notification not found" });
    }

    notification.is_read = true;
    await notificationRepository().save(notification);

    res.json(notification);
  } catch (error) {
    console.error("Mark notification read error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Mark all notifications as read
router.put("/mark-all-read", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    await notificationRepository()
      .createQueryBuilder()
      .update(Notification)
      .set({ is_read: true })
      .where("user_id = :userId", { userId: user.id })
      .andWhere("is_read = false")
      .execute();

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Mark all read error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Delete notification
router.delete("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const notificationId = req.params.id;
    const user = req.user!;

    const notification = await notificationRepository().findOne({
      where: { id: notificationId, user_id: user.id }
    });

    if (!notification) {
      return res.status(404).json({ detail: "Notification not found" });
    }

    await notificationRepository().remove(notification);
    res.json({ message: "Notification deleted" });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
