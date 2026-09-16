/**
 * Serialized Leads filter state stored on saved_filters.filter_json.
 * Applying a saved view means feeding this object into the existing
 * GET /leads query (applyLeadListFilters) — no parallel filter path.
 */
export interface LeadFilterState {
  status: string;
  source: string;
  campaign: string;
  assigned_to: string;
  search: string;
}

export const DEFAULT_LEAD_FILTER: LeadFilterState = {
  status: "all",
  source: "all",
  campaign: "all",
  assigned_to: "all",
  search: "",
};

export const MAX_SAVED_FILTER_NAME_LENGTH = 100;
export const MAX_SAVED_FILTERS_PER_USER = 50;
const MAX_FILTER_VALUE_LENGTH = 255;
const MAX_SEARCH_LENGTH = 200;

function clipString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Keep only the known lead-list keys. Unknown fields are dropped.
 * Values that no longer exist in option catalogs (retired campaigns, etc.)
 * are preserved so applying the view still hits the existing list query
 * and returns an empty/adjusted result instead of erroring.
 */
export function sanitizeLeadFilterJson(raw: unknown): LeadFilterState {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  return {
    status: clipString(src.status, MAX_FILTER_VALUE_LENGTH) || DEFAULT_LEAD_FILTER.status,
    source: clipString(src.source, MAX_FILTER_VALUE_LENGTH) || DEFAULT_LEAD_FILTER.source,
    campaign: clipString(src.campaign, MAX_FILTER_VALUE_LENGTH) || DEFAULT_LEAD_FILTER.campaign,
    assigned_to: clipString(src.assigned_to, MAX_FILTER_VALUE_LENGTH) || DEFAULT_LEAD_FILTER.assigned_to,
    search: typeof src.search === "string" ? src.search.trim().slice(0, MAX_SEARCH_LENGTH) : "",
  };
}

/** Query params the existing GET /leads list already understands. */
export function leadFilterToQuery(filter: LeadFilterState): Record<string, string> {
  const query: Record<string, string> = {};
  if (filter.status && filter.status !== "all") query.status = filter.status;
  if (filter.source && filter.source !== "all") query.source = filter.source;
  if (filter.campaign && filter.campaign !== "all") query.campaign = filter.campaign;
  if (filter.assigned_to && filter.assigned_to !== "all") query.assigned_to = filter.assigned_to;
  if (filter.search) query.search = filter.search;
  return query;
}

export function sanitizeSavedFilterName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().slice(0, MAX_SAVED_FILTER_NAME_LENGTH);
  return trimmed || null;
}
