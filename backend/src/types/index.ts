export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  TEAM_LEAD = 'team_lead',
  SALES_REP = 'sales_rep'
}

export enum LeadStatus {
  NEW = 'new',
  INTERESTED = 'interested',
  NOT_INTERESTED = 'not_interested',
  FOLLOWUP = 'followup',
  WON = 'won',
  LOST = 'lost'
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PARTIAL = 'partial',
  PAID = 'paid'
}

export enum CallOutcome {
  CONNECTED = 'connected',
  NO_ANSWER = 'no_answer',
  BUSY = 'busy',
  VOICEMAIL = 'voicemail',
  WRONG_NUMBER = 'wrong_number',
  CALLBACK_REQUESTED = 'callback_requested'
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  is_active: boolean;
  password_hash: string;
  created_at: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  is_active: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: string;
  campaign?: string;
  city?: string;
  status: LeadStatus;
  assigned_to?: string;
  assigned_name?: string;
  attempt_count: number;
  last_activity?: string;
  next_followup?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface LeadResponse extends Lead {
  is_overdue: boolean;
  hours_since_creation: number;
}

export interface CallLog {
  id: string;
  lead_id: string;
  user_id: string;
  user_name: string;
  outcome: CallOutcome;
  duration_minutes: number;
  notes?: string;
  next_followup?: string;
  created_at: string;
}

export interface Booking {
  id: string;
  lead_id: string;
  lead_name?: string;
  hotel_name: string;
  check_in: string;
  check_out: string;
  final_price: number;
  bid_price: number;
  payment_status: PaymentStatus;
  payment_amount: number;
  notes?: string;
  created_at: string;
  created_by: string;
}

export interface Payment {
  id: string;
  booking_id: string;
  amount: number;
  notes?: string;
  created_at: string;
  created_by: string;
}

export interface Activity {
  id: string;
  lead_id: string;
  user_id?: string;
  user_name?: string;
  action: string;
  details?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  lead_id?: string;
  created_at: string;
}

export interface DashboardStats {
  total_leads: number;
  new_leads: number;
  contacted_leads: number;
  qualified_leads: number;
  closed_won: number;
  closed_lost: number;
  overdue_followups: number;
  uncontacted_over_1hr: number;
  total_revenue: number;
  monthly_revenue: number;
  conversion_rate: number;
  avg_deal_size: number;
}

export interface LeaderboardEntry {
  user_id: string;
  user_name: string;
  avatar?: string;
  leads_closed: number;
  revenue: number;
  conversion_rate: number;
  calls_made: number;
}

export interface TokenPayload {
  sub: string;
  role: string;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
