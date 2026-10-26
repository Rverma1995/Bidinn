export type LeadListFilters = {
  status: string;
  source: string;
  campaign: string;
  assigned_to: string;
  search: string;
};

export const DEFAULT_LEAD_FILTERS: LeadListFilters = {
  status: 'all',
  source: 'all',
  campaign: 'all',
  assigned_to: 'all',
  search: '',
};

export type LeadListViewState = {
  filters: LeadListFilters;
  showUncontactedOnly: boolean;
  showOverdueOnly: boolean;
  showUpcomingOnly: boolean;
  currentPage: number;
  activeSavedFilterId: string | null;
};

export const DEFAULT_LEAD_LIST_STATE: LeadListViewState = {
  filters: { ...DEFAULT_LEAD_FILTERS },
  showUncontactedOnly: false,
  showOverdueOnly: false,
  showUpcomingOnly: false,
  currentPage: 1,
  activeSavedFilterId: null,
};

export const LEAD_LIST_STATE_KEY = 'bidinn.leads.listState';

export type LeadDetailLocationState = {
  fromLeads?: boolean;
  leadsListSearch?: string;
};

function asFilterValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asPage(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : 1;
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

export function leadFiltersEqual(a: LeadListFilters, b: LeadListFilters): boolean {
  return (
    a.status === b.status &&
    a.source === b.source &&
    a.campaign === b.campaign &&
    a.assigned_to === b.assigned_to &&
    a.search === b.search
  );
}

/** Map a saved filter_json blob onto the Leads page filter state. */
export function filtersFromSaved(filterJson: unknown): LeadListFilters {
  let raw: unknown = filterJson;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  const src = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

  return {
    status: asFilterValue(src.status, DEFAULT_LEAD_FILTERS.status),
    source: asFilterValue(src.source, DEFAULT_LEAD_FILTERS.source),
    campaign: asFilterValue(src.campaign, DEFAULT_LEAD_FILTERS.campaign),
    assigned_to: asFilterValue(src.assigned_to, DEFAULT_LEAD_FILTERS.assigned_to),
    search: typeof src.search === 'string' ? src.search : '',
  };
}

export function hasActiveLeadFilters(filters: LeadListFilters): boolean {
  return (
    filters.status !== 'all' ||
    filters.source !== 'all' ||
    filters.campaign !== 'all' ||
    filters.assigned_to !== 'all' ||
    Boolean(filters.search)
  );
}

/** Same query keys GET /leads already accepts — saved views reuse this, not a second path. */
export function leadFiltersToQueryParams(filters: LeadListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.source && filters.source !== 'all') params.set('source', filters.source);
  if (filters.campaign && filters.campaign !== 'all') params.set('campaign', filters.campaign);
  if (filters.assigned_to && filters.assigned_to !== 'all') params.set('assigned_to', filters.assigned_to);
  if (filters.search) params.set('search', filters.search);
  return params;
}

export function searchParamsHaveLeadListState(params: URLSearchParams): boolean {
  return Boolean(
    params.get('filter') ||
    params.get('status') ||
    params.get('source') ||
    params.get('campaign') ||
    params.get('assigned_to') ||
    params.get('search') ||
    params.get('page')
  );
}

export function leadListStateFromSearchParams(params: URLSearchParams): LeadListViewState {
  const filter = params.get('filter');
  return {
    filters: {
      ...DEFAULT_LEAD_FILTERS,
      status: params.get('status') || 'all',
      source: params.get('source') || 'all',
      campaign: params.get('campaign') || 'all',
      assigned_to: params.get('assigned_to') || 'all',
      search: params.get('search') || '',
    },
    showUncontactedOnly: filter === 'uncontacted',
    showOverdueOnly: filter === 'overdue',
    showUpcomingOnly: filter === 'upcoming',
    currentPage: asPage(params.get('page')),
    activeSavedFilterId: null,
  };
}

export function leadListStateToSearchParams(state: LeadListViewState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.showUncontactedOnly) {
    params.set('filter', 'uncontacted');
  } else if (state.showOverdueOnly) {
    params.set('filter', 'overdue');
  } else if (state.showUpcomingOnly) {
    params.set('filter', 'upcoming');
  } else {
    leadFiltersToQueryParams(state.filters).forEach((value, key) => params.set(key, value));
  }
  if (state.currentPage > 1) params.set('page', String(state.currentPage));
  return params;
}

export function parsePersistedLeadListState(raw: unknown): LeadListViewState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const specialCount = [src.showUncontactedOnly, src.showOverdueOnly, src.showUpcomingOnly].filter(Boolean).length;
  return {
    filters: filtersFromSaved(src.filters),
    showUncontactedOnly: src.showUncontactedOnly === true && specialCount <= 1,
    showOverdueOnly: src.showOverdueOnly === true && specialCount <= 1,
    showUpcomingOnly: src.showUpcomingOnly === true && specialCount <= 1,
    currentPage: asPage(src.currentPage),
    activeSavedFilterId: typeof src.activeSavedFilterId === 'string' && src.activeSavedFilterId
      ? src.activeSavedFilterId
      : null,
  };
}

export function readPersistedLeadListState(): LeadListViewState | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(LEAD_LIST_STATE_KEY);
    if (!raw) return null;
    return parsePersistedLeadListState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function persistLeadListState(state: LeadListViewState): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(LEAD_LIST_STATE_KEY, JSON.stringify(state));
  } catch {
    // Private mode / quota — list still works, just won't survive a remount.
  }
}

/**
 * URL wins for dashboard/deep links (`?filter=uncontacted`, `?status=new`).
 * Empty `/leads` falls back to the last list view so Back from a lead keeps filters.
 */
export function resolveLeadListState(params: URLSearchParams): LeadListViewState {
  const stored = readPersistedLeadListState();
  if (searchParamsHaveLeadListState(params)) {
    const fromUrl = leadListStateFromSearchParams(params);
    if (
      stored?.activeSavedFilterId &&
      leadFiltersEqual(stored.filters, fromUrl.filters) &&
      !fromUrl.showUncontactedOnly &&
      !fromUrl.showOverdueOnly &&
      !fromUrl.showUpcomingOnly
    ) {
      fromUrl.activeSavedFilterId = stored.activeSavedFilterId;
    }
    return fromUrl;
  }
  return stored ?? { ...DEFAULT_LEAD_LIST_STATE, filters: { ...DEFAULT_LEAD_FILTERS } };
}

export function leadDetailLocationState(search: string): LeadDetailLocationState {
  return { fromLeads: true, leadsListSearch: search };
}

export function leadsListPathFromDetailState(state: unknown): string {
  const nav = state && typeof state === 'object' ? (state as LeadDetailLocationState) : null;
  if (nav?.fromLeads) {
    return `/leads${nav.leadsListSearch || ''}`;
  }
  const stored = readPersistedLeadListState();
  if (!stored) return '/leads';
  const search = leadListStateToSearchParams(stored).toString();
  return search ? `/leads?${search}` : '/leads';
}
