/**
 * Client-side helpers for the command palette.
 * Lead search reuses GET /leads?search= (server-scoped for sales reps).
 * Booking jump reuses GET /bookings (also sales-rep scoped) and filters locally.
 */

export const COMMAND_SEARCH_MIN_CHARS = 2;
export const COMMAND_SEARCH_DEBOUNCE_MS = 300;
export const LEAD_SEARCH_LIMIT = 8;
export const BOOKING_LIST_LIMIT = 1000;
export const BOOKING_RESULT_LIMIT = 8;

export type LeadSearchHit = {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  status?: string;
};

export type BookingSearchHit = {
  id: string;
  hotel_name?: string;
  lead_name?: string;
  lead_id?: string;
};

export function buildLeadSearchUrl(query: string): string {
  const params = new URLSearchParams();
  params.set('search', query.trim());
  params.set('compact', 'true');
  params.set('limit', String(LEAD_SEARCH_LIMIT));
  params.set('page', '1');
  return `/leads?${params.toString()}`;
}

export function buildBookingsListUrl(): string {
  const params = new URLSearchParams();
  params.set('limit', String(BOOKING_LIST_LIMIT));
  params.set('page', '1');
  return `/bookings?${params.toString()}`;
}

/** Palette must never send assigned_to — scoping is the existing GET /leads rule. */
export function leadSearchUrlLeaksAssigneeFilter(url: string): boolean {
  return new URLSearchParams(url.split('?')[1] || '').has('assigned_to');
}

export function extractLeads(data: unknown): LeadSearchHit[] {
  if (Array.isArray(data)) return data as LeadSearchHit[];
  if (data && typeof data === 'object' && Array.isArray((data as { leads?: unknown }).leads)) {
    return (data as { leads: LeadSearchHit[] }).leads;
  }
  return [];
}

export function extractBookings(data: unknown): BookingSearchHit[] {
  if (Array.isArray(data)) return data as BookingSearchHit[];
  if (data && typeof data === 'object' && Array.isArray((data as { bookings?: unknown }).bookings)) {
    return (data as { bookings: BookingSearchHit[] }).bookings;
  }
  return [];
}

export function filterBookingsByQuery(
  bookings: BookingSearchHit[],
  query: string
): BookingSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return bookings
    .filter(
      (b) =>
        (b.hotel_name && b.hotel_name.toLowerCase().includes(q)) ||
        (b.lead_name && b.lead_name.toLowerCase().includes(q))
    )
    .slice(0, BOOKING_RESULT_LIMIT);
}

export function leadJumpPath(leadId: string): string {
  return `/leads/${leadId}`;
}

export function bookingJumpPath(bookingId: string): string {
  return `/bookings?booking=${encodeURIComponent(bookingId)}`;
}
