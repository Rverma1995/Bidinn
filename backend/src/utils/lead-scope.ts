import { SelectQueryBuilder, ObjectLiteral } from "typeorm";
import { AuthUser } from "../types";

/**
 * Sales reps are scoped to assigned_to = their user id on every leads query path.
 * Admin / manager / team_lead see all leads unless they pass an assigned_to filter.
 */
export function isSalesRep(user?: AuthUser | null): boolean {
  return user?.role === "sales_rep";
}

export function applySalesRepLeadScope<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  user: AuthUser,
  alias = "lead"
): SelectQueryBuilder<T> {
  if (isSalesRep(user)) {
    queryBuilder.andWhere(`${alias}.assigned_to = :salesRepScopeId`, { salesRepScopeId: user.id });
  }
  return queryBuilder;
}

export function canAccessLead(lead: { assigned_to?: string | null }, user: AuthUser): boolean {
  if (!isSalesRep(user)) return true;
  return lead.assigned_to === user.id;
}

/**
 * Parse a query param that may be a single value or comma-separated list.
 * "all" (or empty) means no filter. Multiple values = OR within that field.
 */
export function parseMultiParam(value?: unknown): string[] | null {
  if (value == null || value === "" || value === "all") return null;
  const raw = Array.isArray(value) ? value.join(",") : String(value);
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "all");
  return parts.length ? parts : null;
}

/**
 * AND across fields. Within a field, comma-separated values use IN (OR).
 * Grouped OR across different fields (e.g. status=new OR source=Website) is not supported.
 */
export function applyLeadListFilters<T extends ObjectLiteral>(
  queryBuilder: SelectQueryBuilder<T>,
  query: Record<string, unknown>,
  alias = "lead"
): SelectQueryBuilder<T> {
  const status = parseMultiParam(query.status);
  const source = parseMultiParam(query.source);
  const campaign = parseMultiParam(query.campaign);
  const assignedTo = parseMultiParam(query.assigned_to);
  const search = typeof query.search === "string" ? query.search.trim() : "";

  if (status) {
    queryBuilder.andWhere(`${alias}.status IN (:...filterStatuses)`, { filterStatuses: status });
  }
  if (source) {
    queryBuilder.andWhere(`${alias}.source IN (:...filterSources)`, { filterSources: source });
  }
  if (campaign) {
    queryBuilder.andWhere(`${alias}.campaign IN (:...filterCampaigns)`, { filterCampaigns: campaign });
  }
  if (assignedTo) {
    queryBuilder.andWhere(`${alias}.assigned_to IN (:...filterAssignees)`, { filterAssignees: assignedTo });
  }
  if (search) {
    queryBuilder.andWhere(
      `(${alias}.name LIKE :search OR ${alias}.phone LIKE :search OR ${alias}.email LIKE :search)`,
      { search: `%${search}%` }
    );
  }
  return queryBuilder;
}

export function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/** Calendar month in the server's local timezone. */
export function startOfCalendarMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** First instant of the next calendar month (exclusive end bound). */
export function startOfNextCalendarMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

/**
 * The completed calendar month before `now`.
 * End is exclusive (start of the current month), so Aug 1 → [Jul 1, Aug 1).
 */
export function previousCalendarMonth(now = new Date()): { start: Date; end: Date } {
  const end = startOfCalendarMonth(now);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
  return { start, end };
}

/** Rolling window ending at `now`: [now - days, now). */
export function priorDaysRange(now = new Date(), days = 7): { start: Date; end: Date } {
  return { start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), end: now };
}

export { normalizePhone } from "./phone";
