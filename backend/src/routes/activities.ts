import { Router, Response } from "express";
import { AppDataSource } from "../config/data-source";
import { Activity, Call, Booking, Payment } from "../entities";
import { authenticateToken, AuthRequest } from "../middleware/auth";

const router = Router();
const activityRepository = () => AppDataSource.getRepository(Activity);
const callRepository = () => AppDataSource.getRepository(Call);
const bookingRepository = () => AppDataSource.getRepository(Booking);
const paymentRepository = () => AppDataSource.getRepository(Payment);

// Get all activities (optionally filtered by lead_id for timeline)
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const leadId = req.query.lead_id as string;
    
    if (leadId) {
      // Fetch comprehensive timeline for a specific lead
      const timeline: any[] = [];
      
      // 1. Get activities logged against this lead
      const activities = await activityRepository().find({
        where: { target_id: leadId },
        order: { created_at: "DESC" },
      });
      
      activities.forEach(act => {
        timeline.push({
          id: act.id,
          type: 'activity',
          action: act.action,
          details: act.details,
          user_name: act.user_name,
          created_at: act.created_at,
        });
      });
      
      // 2. Get all calls for this lead
      const calls = await callRepository().find({
        where: { lead_id: leadId },
        order: { created_at: "DESC" },
      });
      
      calls.forEach(call => {
        timeline.push({
          id: call.id,
          type: 'call',
          action: `Call - ${formatOutcome(call.outcome)}`,
          details: call.notes ? `${call.duration_minutes} min • ${call.notes}` : `Duration: ${call.duration_minutes} min`,
          user_name: call.user_name,
          created_at: call.created_at,
          outcome: call.outcome,
          duration: call.duration_minutes,
          next_followup: call.next_followup,
        });
      });
      
      // 3. Get all bookings for this lead
      const bookings = await bookingRepository().find({
        where: { lead_id: leadId },
        relations: ["created_by"],
        order: { created_at: "DESC" },
      });
      
      bookings.forEach(booking => {
        timeline.push({
          id: booking.id,
          type: 'booking',
          action: `Booking Created - ${booking.hotel_name}`,
          details: `₹${booking.final_price?.toLocaleString('en-IN') || '0'} • ${formatDateRange(booking.check_in, booking.check_out)}`,
          user_name: booking.created_by?.name || 'System',
          created_at: booking.created_at,
          booking_id: booking.id,
          hotel_name: booking.hotel_name,
          amount: booking.final_price,
        });
      });
      
      // 4. Get all payments for bookings of this lead
      const bookingIds = bookings.map(b => b.id);
      if (bookingIds.length > 0) {
        const payments = await paymentRepository()
          .createQueryBuilder("payment")
          .leftJoinAndSelect("payment.creator", "user")
          .where("payment.booking_id IN (:...bookingIds)", { bookingIds })
          .orderBy("payment.created_at", "DESC")
          .getMany();
        
        payments.forEach(payment => {
          const booking = bookings.find(b => b.id === payment.booking_id);
          timeline.push({
            id: payment.id,
            type: 'payment',
            action: `Payment Received - ₹${payment.amount?.toLocaleString('en-IN') || '0'}`,
            details: payment.notes || (booking ? `For: ${booking.hotel_name}` : ''),
            user_name: payment.creator?.name || 'System',
            created_at: payment.created_at,
            amount: payment.amount,
          });
        });
      }
      
      // Sort timeline by date (newest first)
      timeline.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      res.json(timeline);
    } else {
      // Original behavior - return all activities
      const activities = await activityRepository().find({
        order: { created_at: "DESC" },
        take: limit,
      });
      res.json(activities);
    }
  } catch (error) {
    console.error("Get activities error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

// Helper functions
function formatOutcome(outcome: string): string {
  const outcomes: Record<string, string> = {
    'answered': 'Answered',
    'no_answer': 'No Answer',
    'busy': 'Busy',
    'voicemail': 'Voicemail',
    'wrong_number': 'Wrong Number',
    'callback_requested': 'Callback Requested',
  };
  return outcomes[outcome] || outcome;
}

function formatDateRange(checkIn: Date | string | null, checkOut: Date | string | null): string {
  if (!checkIn || !checkOut) return '';
  const formatDate = (d: Date | string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };
  return `${formatDate(checkIn)} - ${formatDate(checkOut)}`;
}

// Get activities for a specific target (limited to prevent performance issues)
router.get("/target/:targetId", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const targetId = req.params.targetId as string;
    const activities = await activityRepository().find({
      where: { target_id: targetId },
      order: { created_at: "DESC" },
      take: 100, // Limit to most recent 100 activities
    });
    
    res.json(activities);
  } catch (error) {
    console.error("Get target activities error:", error);
    res.status(500).json({ detail: "Internal server error" });
  }
});

export default router;
