import { Router, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Get activities
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { lead_id, limit = '50' } = req.query;

    let query = 'SELECT * FROM activities WHERE 1=1';
    const params: any[] = [];

    if (lead_id) {
      query += ' AND lead_id = ?';
      params.push(lead_id);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit as string));

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ detail: 'Failed to fetch activities' });
  }
});

export default router;
