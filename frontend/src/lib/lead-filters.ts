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

function asFilterValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
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
