import { Router, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Booking, PaymentStatus, Lead, Activity, UserRole } from "../entities";
import { authenticateToken, requireRole, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();
const bookingRepository = () => AppDataSource.getRepository(Booking);
const leadRepository = () => AppDataSource.getRepository(Lead);
const activityRepository = () => AppDataSource.getRepository(Activity);

// Get booking reasons - MUST be before /:id route
router.get("/reasons", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const reasons = [
      "Flight Ticket",
      "Dubai Tour",
      "Thailand Tour", 
      "Manali Tour",
      "Sri Lanka",
      "Maldives",
      "Singapore",
      "Europe Tour",
      "Cruise Package",
      "Honeymoon Package",
      "Family Vacation",
      "Corporate Trip",
      "Adventure Trip",
      "Pilgrimage",
      "Other",
    ];
    res.json(reasons);
  } catch (error) {
    console.error("Get booking reasons error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get all bookings with pagination
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;

    const [bookings, total] = await bookingRepository().findAndCount({
      order: { created_at: "DESC" },
      skip,
      take: limit,
    });

    res.json({
      bookings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error("Get bookings error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Get booking by ID
router.get("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const bookingId = req.params.id as string;
    const booking = await bookingRepository().findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      return res.status(404).json({ detail: "Booking not found" });
    }

    res.json(booking);
  } catch (error) {
    console.error("Get booking error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Create booking
router.post("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { lead_id, hotel_name, check_in, check_out, final_price, bid_price, notes, booking_reason } = req.body;

    if (!lead_id || !hotel_name || !check_in || !check_out || !final_price) {
      return res.status(400).json({ detail: "lead_id, hotel_name, check_in, check_out, and final_price are required" });
    }

    const lead = await leadRepository().findOne({ where: { id: lead_id } });
    if (!lead) {
      return res.status(404).json({ detail: "Lead not found" });
    }

    const booking = bookingRepository().create({
      id: uuidv4(),
      lead_id,
      lead_name: lead.name,
      hotel_name,
      check_in: new Date(check_in),
      check_out: new Date(check_out),
      final_price: parseFloat(final_price),
      bid_price: bid_price ? parseFloat(bid_price) : undefined,
      payment_status: PaymentStatus.UNPAID,
      payment_amount: 0,
      notes,
      booking_reason,
      created_by_id: req.user!.id,
    });

    await bookingRepository().save(booking);

    // Log activity
    const activity = activityRepository().create({
      id: uuidv4(),
      user_id: req.user!.id,
      user_name: req.user!.name,
      action: "created_booking",
      target_id: booking.id,
      target_type: "booking",
      target_name: lead.name,
      details: `Hotel: ${hotel_name}, Amount: ${final_price}`,
    });
    await activityRepository().save(activity);

    res.status(201).json(booking);
  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Update booking
router.put("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const bookingId = req.params.id as string;
    const booking = await bookingRepository().findOne({ where: { id: bookingId } });

    if (!booking) {
      return res.status(404).json({ detail: "Booking not found" });
    }

    const { hotel_name, check_in, check_out, final_price, bid_price, payment_status, payment_amount, notes, booking_reason } = req.body;

    if (hotel_name) booking.hotel_name = hotel_name;
    if (check_in) booking.check_in = new Date(check_in);
    if (check_out) booking.check_out = new Date(check_out);
    if (final_price !== undefined) booking.final_price = parseFloat(final_price);
    if (bid_price !== undefined) booking.bid_price = bid_price ? parseFloat(bid_price) : undefined;
    if (payment_status) booking.payment_status = payment_status;
    if (payment_amount !== undefined) booking.payment_amount = parseFloat(payment_amount);
    if (notes !== undefined) booking.notes = notes;
    if (booking_reason !== undefined) booking.booking_reason = booking_reason;

    await bookingRepository().save(booking);

    res.json(booking);
  } catch (error) {
    console.error("Update booking error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Delete booking
router.delete("/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const bookingId = req.params.id as string;
    const booking = await bookingRepository().findOne({ where: { id: bookingId } });

    if (!booking) {
      return res.status(404).json({ detail: "Booking not found" });
    }

    await bookingRepository().remove(booking);
    res.json({ message: "Booking deleted successfully" });
  } catch (error) {
    console.error("Delete booking error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
