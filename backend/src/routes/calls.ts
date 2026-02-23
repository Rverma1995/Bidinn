import { Router, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Get calls
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { lead_id, user_id } = req.query;

    let query = 'SELECT * FROM calls WHERE 1=1';
    const params: any[] = [];

    if (lead_id) {
      query += ' AND lead_id = ?';
      params.push(lead_id);
    }
    if (user_id) {
      query += ' AND user_id = ?';
      params.push(user_id);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get calls error:', error);
    res.status(500).json({ detail: 'Failed to fetch calls' });
  }
});

// Create call log
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { lead_id, outcome, duration_minutes = 0, notes, next_followup } = req.body;
    const user = req.user!;

    // Check lead exists
    const [leadRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM leads WHERE id = ?',
      [lead_id]
    );

    if (leadRows.length === 0) {
      res.status(404).json({ detail: 'Lead not found' });
      return;
    }

    const lead = leadRows[0];
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const { v4: uuidv4 } = await import('uuid');
    const callId = uuidv4();

    // Insert call log
    await pool.execute(
      `INSERT INTO calls (id, lead_id, user_id, user_name, outcome, duration_minutes, notes, next_followup, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [callId, lead_id, user.id, user.name, outcome, duration_minutes, notes || null, next_followup || null, now]
    );

    // Update lead
    const newAttemptCount = (lead.attempt_count || 0) + 1;
    let newStatus = lead.status;
    
    if (outcome === 'connected' && lead.status === 'new') {
      newStatus = 'interested';
    }

    const updateParams: any[] = [newAttemptCount, now, now, newStatus];
    let updateQuery = 'UPDATE leads SET attempt_count = ?, last_activity = ?, updated_at = ?, status = ?';
    
    if (next_followup) {
      updateQuery += ', next_followup = ?';
      updateParams.push(next_followup);
    }
    
    updateQuery += ' WHERE id = ?';
    updateParams.push(lead_id);

    await pool.execute(updateQuery, updateParams);

    res.status(201).json({
      id: callId,
      lead_id,
      user_id: user.id,
      user_name: user.name,
      outcome,
      duration_minutes,
      notes,
      next_followup,
      created_at: now
    });
  } catch (error) {
    console.error('Create call error:', error);
    res.status(500).json({ detail: 'Failed to create call' });
  }
});

export default router;
