import { Router, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { UserRole, UserResponse } from '../types';

const router = Router();

// Get all users
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, email, name, role, avatar, is_active, created_at FROM users ORDER BY created_at DESC'
    );

    res.json(rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ detail: 'Failed to fetch users' });
  }
});

// Get user by ID
router.get('/:userId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, email, name, role, avatar, is_active, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ detail: 'User not found' });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ detail: 'Failed to fetch user' });
  }
});

// Update user
router.put('/:userId', authMiddleware, requireRoles([UserRole.ADMIN, UserRole.MANAGER]), async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Remove sensitive fields
    delete updateData.password_hash;
    delete updateData.id;

    const allowedFields = ['name', 'role', 'avatar', 'is_active'];
    const updates: string[] = [];
    const values: any[] = [];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(updateData[field]);
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ detail: 'No valid fields to update' });
      return;
    }

    values.push(userId);
    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, email, name, role, avatar, is_active, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ detail: 'User not found' });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ detail: 'Failed to update user' });
  }
});

export default router;
