import { AppDataSource } from "../config/data-source";
import { Lead } from "../entities";
import { normalizePhone } from "../utils/phone";

export interface PhoneMatchLead {
  id: string;
  name: string;
  phone: string;
  phone_normalized?: string | null;
  last_activity: Date | string | null;
  updated_at: Date | string;
  created_at: Date | string;
}

export interface PhoneMatchResult {
  lead: PhoneMatchLead | null;
  ambiguous: boolean;
  unmatched: boolean;
  all: PhoneMatchLead[];
}

function activityTime(lead: PhoneMatchLead): number {
  const raw = lead.last_activity || lead.updated_at || lead.created_at;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * When several leads share a number, attach the call to the most recently active one.
 * Ambiguity is the caller's problem to surface on the timeline — never pick silently.
 */
export function pickMostRecentlyActive(leads: PhoneMatchLead[]): PhoneMatchResult {
  if (!leads.length) {
    return { lead: null, ambiguous: false, unmatched: true, all: [] };
  }
  const sorted = [...leads].sort((a, b) => activityTime(b) - activityTime(a));
  return {
    lead: sorted[0],
    ambiguous: sorted.length > 1,
    unmatched: false,
    all: sorted,
  };
}

export async function findLeadsByPhone(rawPhone: string | null | undefined): Promise<PhoneMatchResult> {
  const normalized = normalizePhone(rawPhone);
  if (!normalized) {
    return { lead: null, ambiguous: false, unmatched: true, all: [] };
  }

  const leads = await AppDataSource.getRepository(Lead).find({
    where: { phone_normalized: normalized },
  });
  return pickMostRecentlyActive(leads);
}
