import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Kanban,
  Calendar,
  CreditCard,
  BarChart3,
  UserCog,
  Settings,
  Building,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getCommandPalettePages } from '../../lib/nav';
import {
  COMMAND_SEARCH_DEBOUNCE_MS,
  COMMAND_SEARCH_MIN_CHARS,
  LEAD_SEARCH_LIMIT,
  bookingJumpPath,
  buildBookingsListUrl,
  buildLeadSearchUrl,
  extractBookings,
  extractLeads,
  filterBookingsByQuery,
  leadJumpPath,
} from '../../lib/command-search';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';

const PAGE_ICONS = {
  '/': LayoutDashboard,
  '/leads': Users,
  '/pipeline': Kanban,
  '/bookings': Calendar,
  '/payments': CreditCard,
  '/reports': BarChart3,
  '/team': UserCog,
  '/settings': Settings,
};

function isCanceled(error) {
  return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';
}

export function CommandPalette({ open, onOpenChange }) {
  const { user, api } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [searching, setSearching] = useState(false);
  const bookingsCacheRef = useRef(null);

  const pages = getCommandPalettePages(user?.role);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      event.preventDefault();
      onOpenChange(!open);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) return;
    setQuery('');
    setLeads([]);
    setBookings([]);
    setSearching(false);
    bookingsCacheRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const q = query.trim();
    if (q.length < COMMAND_SEARCH_MIN_CHARS) {
      setLeads([]);
      setBookings([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setSearching(true);

    const timer = setTimeout(async () => {
      try {
        const leadReq = api.get(buildLeadSearchUrl(q), { signal: controller.signal });
        const bookingReq = bookingsCacheRef.current
          ? Promise.resolve({ data: { bookings: bookingsCacheRef.current } })
          : api.get(buildBookingsListUrl(), { signal: controller.signal });

        const [leadRes, bookingRes] = await Promise.all([leadReq, bookingReq]);
        if (cancelled) return;

        const bookingList = extractBookings(bookingRes.data);
        if (!bookingsCacheRef.current) {
          bookingsCacheRef.current = bookingList;
        }

        setLeads(extractLeads(leadRes.data).slice(0, LEAD_SEARCH_LIMIT));
        setBookings(filterBookingsByQuery(bookingList, q));
      } catch (error) {
        if (cancelled || isCanceled(error)) return;
        setLeads([]);
        setBookings([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, COMMAND_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, open, query]);

  const runCommand = useCallback(
    (path) => {
      onOpenChange(false);
      navigate(path);
    },
    [navigate, onOpenChange]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search pages, leads, or bookings..."
        value={query}
        onValueChange={setQuery}
        data-testid="command-palette-input"
      />
      <CommandList data-testid="command-palette-list">
        <CommandEmpty>
          {searching
            ? 'Searching…'
            : query.trim().length >= COMMAND_SEARCH_MIN_CHARS
              ? 'No results found.'
              : 'No matching pages.'}
        </CommandEmpty>

        {pages.length > 0 && (
          <CommandGroup heading="Pages">
            {pages.map((item) => {
              const Icon = PAGE_ICONS[item.path] || Settings;
              return (
                <CommandItem
                  key={item.path}
                  value={`page ${item.label} ${item.path}`}
                  onSelect={() => runCommand(item.path)}
                  data-testid={`command-page-${item.label.toLowerCase()}`}
                >
                  <Icon />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {leads.length > 0 && (
          <CommandGroup heading="Leads">
            {leads.map((lead) => (
              <CommandItem
                key={lead.id}
                value={`lead ${lead.id} ${lead.name || ''} ${lead.phone || ''}`}
                onSelect={() => runCommand(leadJumpPath(lead.id))}
                data-testid={`command-lead-${lead.id}`}
              >
                <Users />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{lead.name || 'Unnamed lead'}</span>
                  {lead.phone ? (
                    <span className="truncate text-xs text-muted-foreground">{lead.phone}</span>
                  ) : null}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {bookings.length > 0 && (
          <CommandGroup heading="Bookings">
            {bookings.map((booking) => (
              <CommandItem
                key={booking.id}
                value={`booking ${booking.id} ${booking.hotel_name || ''} ${booking.lead_name || ''}`}
                onSelect={() => runCommand(bookingJumpPath(booking.id))}
                data-testid={`command-booking-${booking.id}`}
              >
                <Building />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{booking.hotel_name || 'Booking'}</span>
                  {booking.lead_name ? (
                    <span className="truncate text-xs text-muted-foreground">{booking.lead_name}</span>
                  ) : null}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searching && query.trim().length >= COMMAND_SEARCH_MIN_CHARS && (
          <CommandGroup>
            <CommandItem value={`${query} searching`} disabled>
              <Loader2 className="animate-spin" />
              <span>Searching leads and bookings…</span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
