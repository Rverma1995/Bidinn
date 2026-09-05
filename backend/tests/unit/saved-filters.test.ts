import assert from "assert";
import {
  DEFAULT_LEAD_FILTER,
  leadFilterToQuery,
  sanitizeLeadFilterJson,
  sanitizeSavedFilterName,
} from "../../src/utils/saved-filters";
import { applyLeadListFilters } from "../../src/utils/lead-scope";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

test("sanitizeLeadFilterJson fills defaults and drops unknown keys", () => {
  const cleaned = sanitizeLeadFilterJson({
    status: "new",
    campaign: "Dubai Tour",
    injected: "nope",
    nested: { x: 1 },
  });
  assert.deepStrictEqual(cleaned, {
    status: "new",
    source: "all",
    campaign: "Dubai Tour",
    assigned_to: "all",
    search: "",
  });
  assert.strictEqual("injected" in cleaned, false);
});

test("sanitizeLeadFilterJson accepts empty/invalid payloads", () => {
  assert.deepStrictEqual(sanitizeLeadFilterJson(null), DEFAULT_LEAD_FILTER);
  assert.deepStrictEqual(sanitizeLeadFilterJson("status=new"), DEFAULT_LEAD_FILTER);
  assert.deepStrictEqual(sanitizeLeadFilterJson(["new"]), DEFAULT_LEAD_FILTER);
});

test("sanitizeLeadFilterJson preserves a retired campaign value", () => {
  const cleaned = sanitizeLeadFilterJson({ campaign: "Retired Summer 2024" });
  assert.strictEqual(cleaned.campaign, "Retired Summer 2024");
});

test("sanitizeSavedFilterName trims, caps length, rejects blank", () => {
  assert.strictEqual(sanitizeSavedFilterName("  Dubai new  "), "Dubai new");
  assert.strictEqual(sanitizeSavedFilterName("   "), null);
  assert.strictEqual(sanitizeSavedFilterName(12), null);
  assert.strictEqual(sanitizeSavedFilterName("x".repeat(120))?.length, 100);
});

test("leadFilterToQuery omits all/empty so GET /leads stays unfiltered on those fields", () => {
  assert.deepStrictEqual(leadFilterToQuery(DEFAULT_LEAD_FILTER), {});
  assert.deepStrictEqual(
    leadFilterToQuery({
      status: "new",
      source: "all",
      campaign: "Gone Camp",
      assigned_to: "all",
      search: "Ravi",
    }),
    { status: "new", campaign: "Gone Camp", search: "Ravi" }
  );
});

test("stale campaign from a saved view applies via existing lead filters without throwing", () => {
  const saved = sanitizeLeadFilterJson({
    status: "new",
    campaign: "Campaign That No Longer Exists",
  });
  const clauses: Array<{ sql: string; params?: unknown }> = [];
  const qb = {
    andWhere(sql: string, params?: unknown) {
      clauses.push({ sql, params });
      return qb;
    },
  };

  applyLeadListFilters(qb as any, leadFilterToQuery(saved));

  assert.strictEqual(clauses.length, 2);
  assert.ok(clauses.some((c) => c.sql.includes("status IN")));
  const campaign = clauses.find((c) => c.sql.includes("campaign IN"));
  assert.ok(campaign, "expected campaign IN clause from saved filter_json");
  assert.deepStrictEqual(
    (campaign?.params as { filterCampaigns: string[] }).filterCampaigns,
    ["Campaign That No Longer Exists"]
  );
});

console.log("All saved-filter tests passed");
