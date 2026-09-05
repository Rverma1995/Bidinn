// Type definitions for Bidinn CRM

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'team_lead' | 'sales_rep';
  avatar?: string;
  is_active: boolean;
  tata_extension?: string | null;
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
  is_overdue?: boolean;
  hours_since_creation?: number;
}

export type LeadStatus = 'new' | 'interested' | 'not_interested' | 'followup' | 'won' | 'lost';

export interface CallLog {
  id: string;
  lead_id: string | null;
  user_id: string | null;
  user_name: string;
  outcome: CallOutcome | null;
  duration_minutes: number;
  notes?: string;
  next_followup?: string;
  created_at: string;
  tata_call_id?: string | null;
  direction?: 'inbound' | 'outbound' | null;
  recording_url?: string | null;
  started_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  customer_phone?: string | null;
}

export type CallOutcome = 'connected' | 'no_answer' | 'busy' | 'voicemail' | 'wrong_number' | 'callback_requested';

export interface Booking {
  id: string;
  lead_id: string;
  lead_name?: string;
  hotel_name: string;
  check_in: string;
  check_out: string;
  final_price: number;
  bid_price?: number;
  payment_status: PaymentStatus;
  payment_amount: number;
  remaining_balance?: number;
  notes?: string;
  booking_reason?: string;
  created_at: string;
  created_by: string;
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface Payment {
  id: string;
  booking_id: string;
  amount: number;
  notes?: string;
  created_at: string;
  created_by: string;
}

export interface DashboardStats {
  total_leads: number;
  new_leads: number;
  monthly_new_leads?: number;
  contacted_leads: number;
  qualified_leads: number;
  closed_won: number;
  closed_lost: number;
  monthly_closed_won?: number;
  monthly_closed_lost?: number;
  overdue_followups: number;
  upcoming_followups?: number;
  uncontacted_over_1hr: number;
  needs_immediate_attention?: number;
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

export interface AgentPerformance {
  agent_id: string;
  agent_name: string;
  agent_email: string;
  agent_avatar?: string;
  agent_role: string;
  total_leads: number;
  contacted: number;
  not_contacted: number;
  converted: number;
  conversion_rate: number;
  total_revenue: number;
  calls_made: number;
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

export interface ApiError {
  detail: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface ImportResult {
  message: string;
  imported: number;
  skipped: number;
  total_rows: number;
  errors: string[];
}

export interface LeadListFilters {
  status: string;
  source: string;
  campaign: string;
  assigned_to: string;
  search: string;
}

export interface SavedFilter {
  id: string;
  user_id: string;
  name: string;
  filter_json: LeadListFilters;
  created_at: string;
}
