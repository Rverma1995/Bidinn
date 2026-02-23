import { Router, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Get notifications
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [user.id]
    );

    res.json(rows);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ detail: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.put('/:notificationId/read', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { notificationId } = req.params;
    const user = req.user!;

    const [result]: any = await pool.execute(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [notificationId, user.id]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ detail: 'Notification not found' });
      return;
    }

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ detail: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/read-all', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    await pool.execute(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
      [user.id]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ detail: 'Failed to mark notifications as read' });
  }
});

export default router;
