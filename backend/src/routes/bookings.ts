import { Router, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { generateUUID, formatDateForMySQL, addActivity } from '../utils/helpers';

const router = Router();

// Valid booking reasons
const BOOKING_REASONS = [
  'Corporate Event',
  'Wedding',
  'Vacation',
  'Business Trip',
  'Conference',
  'Family Reunion',
  'Anniversary',
  'Honeymoon',
  'Group Tour',
  'Other'
];

// Get booking reasons
router.get('/reasons', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  res.json(BOOKING_REASONS);
});

// Create booking
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { lead_id, hotel_name, check_in, check_out, final_price, bid_price, notes, booking_reason } = req.body;
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
    const now = formatDateForMySQL(new Date());
    const id = generateUUID();

    await pool.execute(
      `INSERT INTO bookings (id, lead_id, lead_name, hotel_name, check_in, check_out, final_price, bid_price, payment_status, payment_amount, notes, booking_reason, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 0, ?, ?, ?, ?)`,
      [id, lead_id, lead.name, hotel_name, check_in, check_out, final_price, bid_price || 0, notes || null, booking_reason || null, now, user.id]
    );

    // Update lead to won
    await pool.execute(
      'UPDATE leads SET status = ?, updated_at = ?, last_activity = ? WHERE id = ?',
      ['won', now, now, lead_id]
    );

    await addActivity(lead_id, 'Booking created', `Hotel: ${hotel_name}${booking_reason ? ` (${booking_reason})` : ''}`, user.id, user.name);

    res.status(201).json({
      id,
      lead_id,
      lead_name: lead.name,
      hotel_name,
      check_in,
      check_out,
      final_price,
      bid_price: bid_price || 0,
      payment_status: 'unpaid',
      payment_amount: 0,
      notes,
      booking_reason,
      created_at: now,
      created_by: user.id
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ detail: 'Failed to create booking' });
  }
});

// Get bookings
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { payment_status, skip = '0', limit = '100' } = req.query;

    let query = 'SELECT * FROM bookings WHERE 1=1';
    const params: any[] = [];

    if (payment_status) {
      query += ' AND payment_status = ?';
      params.push(payment_status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(skip as string));

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ detail: 'Failed to fetch bookings' });
  }
});

// Get booking by ID
router.get('/:bookingId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (rows.length === 0) {
      res.status(404).json({ detail: 'Booking not found' });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ detail: 'Failed to fetch booking' });
  }
});

// Update booking
router.put('/:bookingId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const updateData = req.body;

    const allowedFields = ['hotel_name', 'check_in', 'check_out', 'final_price', 'bid_price', 'notes'];
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

    values.push(bookingId);
    await pool.execute(
      `UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (rows.length === 0) {
      res.status(404).json({ detail: 'Booking not found' });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({ detail: 'Failed to update booking' });
  }
});

export default router;
