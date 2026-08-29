import assert from "assert";
import {
  applyLeadListFilters,
  applySalesRepLeadScope,
  canAccessLead,
  csvEscape,
  isSalesRep,
  parseMultiParam,
  startOfCalendarMonth,
  startOfNextCalendarMonth,
} from "../../src/utils/lead-scope";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

test("isSalesRep is true only for sales_rep role", () => {
  assert.strictEqual(isSalesRep({ id: "1", role: "sales_rep" } as any), true);
  assert.strictEqual(isSalesRep({ id: "1", role: "admin" } as any), false);
  assert.strictEqual(isSalesRep({ id: "1", role: "manager" } as any), false);
  assert.strictEqual(isSalesRep({ id: "1", role: "team_lead" } as any), false);
  assert.strictEqual(isSalesRep(null), false);
});

test("canAccessLead: non-reps always, reps only assigned", () => {
  const admin = { id: "admin", role: "admin" } as any;
  const manager = { id: "mgr", role: "manager" } as any;
  const teamLead = { id: "tl", role: "team_lead" } as any;
  const rep = { id: "rep-1", role: "sales_rep" } as any;
  assert.strictEqual(canAccessLead({ assigned_to: "other" }, admin), true);
  assert.strictEqual(canAccessLead({ assigned_to: "other" }, manager), true);
  assert.strictEqual(canAccessLead({ assigned_to: "other" }, teamLead), true);
  assert.strictEqual(canAccessLead({ assigned_to: "rep-1" }, rep), true);
  assert.strictEqual(canAccessLead({ assigned_to: "other" }, rep), false);
  assert.strictEqual(canAccessLead({ assigned_to: null }, rep), false);
  assert.strictEqual(canAccessLead({ assigned_to: undefined }, rep), false);
});

test("parseMultiParam treats all/empty as no filter", () => {
  assert.strictEqual(parseMultiParam(undefined), null);
  assert.strictEqual(parseMultiParam(""), null);
  assert.strictEqual(parseMultiParam("all"), null);
  assert.strictEqual(parseMultiParam("  all  "), null);
  assert.strictEqual(parseMultiParam([]), null);
  assert.strictEqual(parseMultiParam(["all", ""]), null);
});

test("parseMultiParam splits comma lists and drops all tokens", () => {
  assert.deepStrictEqual(parseMultiParam("Dubai Tour"), ["Dubai Tour"]);
  assert.deepStrictEqual(parseMultiParam("Dubai Tour,Maldives"), ["Dubai Tour", "Maldives"]);
  assert.deepStrictEqual(parseMultiParam("Dubai Tour, all, Maldives"), ["Dubai Tour", "Maldives"]);
  assert.deepStrictEqual(parseMultiParam(["new", "interested"]), ["new", "interested"]);
});

test("applyLeadListFilters ANDs across fields and ORs within a field", () => {
  const clauses: Array<{ sql: string; params?: unknown }> = [];
  const qb = {
    andWhere(sql: string, params?: unknown) {
      clauses.push({ sql, params });
      return qb;
    },
  };

  applyLeadListFilters(qb as any, {
    status: "new,interested",
    source: "Website",
    campaign: "Dubai Tour,Maldives",
    assigned_to: "all",
    search: "Ravi",
  });

  const sql = clauses.map((c) => c.sql).join(" | ");
  assert.ok(sql.includes("status IN"), sql);
  assert.ok(sql.includes("source IN"), sql);
  assert.ok(sql.includes("campaign IN"), sql);
  assert.ok(!sql.includes("assigned_to IN"), sql);
  assert.ok(sql.includes("name LIKE"), sql);

  const statusParams = clauses.find((c) => c.sql.includes("status IN"))?.params as { filterStatuses: string[] };
  assert.deepStrictEqual(statusParams.filterStatuses, ["new", "interested"]);
  const campaignParams = clauses.find((c) => c.sql.includes("campaign IN"))?.params as { filterCampaigns: string[] };
  assert.deepStrictEqual(campaignParams.filterCampaigns, ["Dubai Tour", "Maldives"]);
});

test("csvEscape quotes and doubles inner quotes", () => {
  assert.strictEqual(csvEscape(null), `""`);
  assert.strictEqual(csvEscape(undefined), `""`);
  assert.strictEqual(csvEscape("hello"), `"hello"`);
  assert.strictEqual(csvEscape(`he"llo`), `"he""llo"`);
  assert.strictEqual(csvEscape("a,b"), `"a,b"`);
  assert.strictEqual(csvEscape("line\nbreak"), `"line\nbreak"`);
});

test("startOfCalendarMonth is day 1 of the current local month", () => {
  const now = new Date("2026-08-29T10:00:00");
  const start = startOfCalendarMonth(now);
  assert.strictEqual(start.getFullYear(), 2026);
  assert.strictEqual(start.getMonth(), 7);
  assert.strictEqual(start.getDate(), 1);
});

test("startOfNextCalendarMonth rolls December into January", () => {
  const next = startOfNextCalendarMonth(new Date("2026-08-29T10:00:00"));
  assert.strictEqual(next.getFullYear(), 2026);
  assert.strictEqual(next.getMonth(), 8);
  assert.strictEqual(next.getDate(), 1);

  const jan = startOfNextCalendarMonth(new Date("2026-12-31T23:59:59"));
  assert.strictEqual(jan.getFullYear(), 2027);
  assert.strictEqual(jan.getMonth(), 0);
  assert.strictEqual(jan.getDate(), 1);
});

test("applySalesRepLeadScope adds assigned_to only for sales_rep", () => {
  const clauses: Array<{ sql: string; params?: unknown }> = [];
  const qb = {
    andWhere(sql: string, params?: unknown) {
      clauses.push({ sql, params });
      return qb;
    },
  };
  applySalesRepLeadScope(qb as any, { id: "admin", role: "admin" } as any);
  applySalesRepLeadScope(qb as any, { id: "mgr", role: "manager" } as any);
  applySalesRepLeadScope(qb as any, { id: "tl", role: "team_lead" } as any);
  assert.strictEqual(clauses.length, 0);

  applySalesRepLeadScope(qb as any, { id: "rep-1", role: "sales_rep" } as any, "lead");
  assert.strictEqual(clauses.length, 1);
  assert.ok(clauses[0].sql.includes("lead.assigned_to = :salesRepScopeId"));
  assert.deepStrictEqual(clauses[0].params, { salesRepScopeId: "rep-1" });
});

test("applyLeadListFilters ignores empty search whitespace", () => {
  const clauses: Array<{ sql: string }> = [];
  const qb = {
    andWhere(sql: string) {
      clauses.push({ sql });
      return qb;
    },
  };
  applyLeadListFilters(qb as any, { search: "   " });
  assert.strictEqual(clauses.length, 0);
});

console.log("All lead-scope tests passed");
