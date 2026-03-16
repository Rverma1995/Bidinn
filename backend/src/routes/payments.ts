import { Router, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Payment, Booking, PaymentStatus, Activity, UserRole } from "../entities";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();
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
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
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
router.get("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
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

export default router;
