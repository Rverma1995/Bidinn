import { Router, Response } from "express";
import { cacheMiddleware, invalidateCacheMiddleware } from "../middleware/cache";
import { CACHE_KEYS, CACHE_TTL } from "../config/cache.constants";
import { AppDataSource } from "../config/data-source";
import { Payment, Booking, PaymentStatus, Activity, UserRole } from "../entities";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// Automatically invalidate caches on any successful mutation in this router
router.use(invalidateCacheMiddleware([CACHE_KEYS.PAYMENTS_LIST, CACHE_KEYS.BOOKINGS_LIST, CACHE_KEYS.DASHBOARD_STATS]));

const paymentRepository = () => AppDataSource.getRepository(Payment);
const bookingRepository = () => AppDataSource.getRepository(Booking);
const activityRepository = () => AppDataSource.getRepository(Activity);

// Record payment
router.post("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { booking_id, amount, notes } = req.body;
    const user = req.user!;

    if (!booking_id || !amount) {
      return res.status(400).json({ detail: "booking_id and amount are required" });
    }

    // Check booking exists
    const booking = await bookingRepository().findOne({ where: { id: booking_id } });
    if (!booking) {
      return res.status(404).json({ detail: "Booking not found" });
    }

    // Create payment record
    const payment = paymentRepository().create({
      id: uuidv4(),
      booking_id,
      amount: parseFloat(amount),
      notes,
      created_by: user.id,
    });
    await paymentRepository().save(payment);

    // Update booking payment status
    const newPaymentAmount = (parseFloat(String(booking.payment_amount)) || 0) + parseFloat(amount);
    let newStatus: PaymentStatus = PaymentStatus.PARTIAL;
    if (newPaymentAmount >= parseFloat(String(booking.final_price))) {
      newStatus = PaymentStatus.PAID;
    }

    booking.payment_amount = newPaymentAmount;
    booking.payment_status = newStatus;
    await bookingRepository().save(booking);

    // Log activity
    if (booking.lead_id) {
      const activity = activityRepository().create({
        id: uuidv4(),
        user_id: user.id,
        user_name: user.name,
        action: "payment_recorded",
        target_id: booking.lead_id,
        target_type: "lead",
        target_name: booking.lead_name || "Unknown",
        details: `Amount: ₹${amount}`,
      });
      await activityRepository().save(activity);
    }

    res.status(201).json(payment);
  } catch (error) {
    console.error("Record payment error:", error);
    res.status(500).json({ detail: "Failed to record payment" });
  }
});

// Get payments
router.get("/", authenticateToken, cacheMiddleware(CACHE_KEYS.PAYMENTS_LIST, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const { booking_id } = req.query;

    let queryBuilder = paymentRepository().createQueryBuilder("payment");

    if (booking_id) {
      queryBuilder = queryBuilder.where("payment.booking_id = :booking_id", { booking_id });
    }

    queryBuilder = queryBuilder.orderBy("payment.created_at", "DESC");

    const payments = await queryBuilder.getMany();
    res.json(payments);
  } catch (error) {
    console.error("Get payments error:", error);
    res.status(500).json({ detail: "Failed to fetch payments" });
  }
});

// Get payment by ID
router.get("/:id", authenticateToken, cacheMiddleware(CACHE_KEYS.PAYMENTS_LIST, CACHE_TTL.SHORT), async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = req.params.id as string;
    const payment = await paymentRepository().findOne({ where: { id: paymentId } });

    if (!payment) {
      return res.status(404).json({ detail: "Payment not found" });
    }

    res.json(payment);
  } catch (error) {
    console.error("Get payment error:", error);
    res.status(500).json({ detail: "Failed to fetch payment" });
  }
});

// Update payment (Admin and Manager only)
router.put("/:id", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = req.params.id as string;
    const { amount, notes } = req.body;
    
    const payment = await paymentRepository().findOne({ where: { id: paymentId } });
    if (!payment) {
      return res.status(404).json({ detail: "Payment not found" });
    }

    const oldAmount = parseFloat(String(payment.amount)) || 0;
    const newAmount = amount !== undefined ? parseFloat(amount) : oldAmount;
    const amountDiff = newAmount - oldAmount;

    // Update payment
    if (amount !== undefined) payment.amount = newAmount;
    if (notes !== undefined) payment.notes = notes;
    await paymentRepository().save(payment);

    // Update booking payment amount if amount changed
    if (amountDiff !== 0 && payment.booking_id) {
      const booking = await bookingRepository().findOne({ where: { id: payment.booking_id } });
      if (booking) {
        const newPaymentAmount = (parseFloat(String(booking.payment_amount)) || 0) + amountDiff;
        booking.payment_amount = Math.max(0, newPaymentAmount);
        
        // Recalculate payment status
        if (booking.payment_amount >= parseFloat(String(booking.final_price))) {
          booking.payment_status = PaymentStatus.PAID;
        } else if (booking.payment_amount > 0) {
          booking.payment_status = PaymentStatus.PARTIAL;
        } else {
          booking.payment_status = PaymentStatus.UNPAID;
        }
        await bookingRepository().save(booking);
      }
    }

    res.json(payment);
  } catch (error) {
    console.error("Update payment error:", error);
    res.status(500).json({ detail: "Failed to update payment" });
  }
});

// Delete payment (Admin and Manager only)
router.delete("/:id", authenticateToken, requireRole([UserRole.ADMIN, UserRole.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = req.params.id as string;
    const payment = await paymentRepository().findOne({ where: { id: paymentId } });

    if (!payment) {
      return res.status(404).json({ detail: "Payment not found" });
    }

    const paymentAmount = parseFloat(String(payment.amount)) || 0;

    // Update booking payment amount
    if (payment.booking_id) {
      const booking = await bookingRepository().findOne({ where: { id: payment.booking_id } });
      if (booking) {
        const newPaymentAmount = Math.max(0, (parseFloat(String(booking.payment_amount)) || 0) - paymentAmount);
        booking.payment_amount = newPaymentAmount;
        
        // Recalculate payment status
        if (newPaymentAmount >= parseFloat(String(booking.final_price))) {
          booking.payment_status = PaymentStatus.PAID;
        } else if (newPaymentAmount > 0) {
          booking.payment_status = PaymentStatus.PARTIAL;
        } else {
          booking.payment_status = PaymentStatus.UNPAID;
        }
        await bookingRepository().save(booking);
      }
    }

    await paymentRepository().remove(payment);
    res.json({ message: "Payment deleted successfully" });
  } catch (error) {
    console.error("Delete payment error:", error);
    res.status(500).json({ detail: "Failed to delete payment" });
  }
});

export default router;
