import { Router, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { authMiddleware } from '../middleware/auth';
import { generateUUID, formatDateForMySQL, addActivity } from '../utils/helpers';

const router = Router();

// Record payment
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { booking_id, amount, notes } = req.body;
    const user = req.user!;

    // Check booking exists
    const [bookingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM bookings WHERE id = ?',
      [booking_id]
    );

    if (bookingRows.length === 0) {
      res.status(404).json({ detail: 'Booking not found' });
      return;
    }

    const booking = bookingRows[0];
    const now = formatDateForMySQL(new Date());
    const id = generateUUID();

    await pool.execute(
      `INSERT INTO payments (id, booking_id, amount, notes, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, booking_id, amount, notes || null, now, user.id]
    );

    // Update booking payment status
    const newPaymentAmount = (parseFloat(booking.payment_amount) || 0) + amount;
    let newStatus = 'partial';
    if (newPaymentAmount >= booking.final_price) {
      newStatus = 'paid';
    }

    await pool.execute(
      'UPDATE bookings SET payment_amount = ?, payment_status = ? WHERE id = ?',
      [newPaymentAmount, newStatus, booking_id]
    );

    if (booking.lead_id) {
      await addActivity(booking.lead_id, 'Payment recorded', `Amount: ₹${amount}`, user.id, user.name);
    }

    res.status(201).json({
      id,
      booking_id,
      amount,
      notes,
      created_at: now,
      created_by: user.id
    });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ detail: 'Failed to record payment' });
  }
});

// Get payments
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { booking_id } = req.query;

    let query = 'SELECT * FROM payments WHERE 1=1';
    const params: any[] = [];

    if (booking_id) {
      query += ' AND booking_id = ?';
      params.push(booking_id);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ detail: 'Failed to fetch payments' });
  }
});

export default router;
