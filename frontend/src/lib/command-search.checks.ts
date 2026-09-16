import assert from "assert";
import {
  getCommandPalettePages,
  getVisibleMainNavItems,
  roleCanAccessPath,
} from "./nav";
import {
  bookingJumpPath,
  buildBookingsListUrl,
  buildLeadSearchUrl,
  extractBookings,
  extractLeads,
  filterBookingsByQuery,
  leadJumpPath,
  leadSearchUrlLeaksAssigneeFilter,
} from "./command-search";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

test("sales_rep cannot jump to Team or Payments (same as Sidebar)", () => {
  const pages = getCommandPalettePages("sales_rep");
  const paths = pages.map((p) => p.path);
  assert.ok(paths.includes("/"));
  assert.ok(paths.includes("/leads"));
  assert.ok(paths.includes("/pipeline"));
  assert.ok(paths.includes("/bookings"));
  assert.ok(paths.includes("/reports"));
  assert.ok(paths.includes("/settings"));
  assert.ok(!paths.includes("/team"));
  assert.ok(!paths.includes("/payments"));
  assert.strictEqual(roleCanAccessPath("sales_rep", "/team"), false);
  assert.strictEqual(roleCanAccessPath("sales_rep", "/payments"), false);
  assert.strictEqual(roleCanAccessPath("sales_rep", "/leads"), true);
  assert.strictEqual(roleCanAccessPath("sales_rep", "/settings"), true);
});

test("sidebar main nav for sales_rep also hides Team and Payments", () => {
  const paths = getVisibleMainNavItems("sales_rep").map((p) => p.path);
  assert.ok(!paths.includes("/team"));
  assert.ok(!paths.includes("/payments"));
  assert.ok(paths.includes("/leads"));
});

test("admin, manager, and team_lead can jump to Team and Payments", () => {
  for (const role of ["admin", "manager", "team_lead"] as const) {
    assert.strictEqual(roleCanAccessPath(role, "/team"), true);
    assert.strictEqual(roleCanAccessPath(role, "/payments"), true);
  }
});

test("unknown or missing role sees no jump targets", () => {
  assert.deepStrictEqual(getCommandPalettePages(null), []);
  assert.deepStrictEqual(getCommandPalettePages("contractor"), []);
});

test("lead search reuses GET /leads?search= and does not send assigned_to", () => {
  const url = buildLeadSearchUrl("  Ravi  ");
  assert.ok(url.startsWith("/leads?"));
  const params = new URLSearchParams(url.split("?")[1]);
  assert.strictEqual(params.get("search"), "Ravi");
  assert.strictEqual(params.get("compact"), "true");
  assert.strictEqual(params.get("limit"), "8");
  assert.strictEqual(params.has("assigned_to"), false);
  assert.strictEqual(leadSearchUrlLeaksAssigneeFilter(url), false);
});

test("lead search URL builder never takes a user id (scoping stays on GET /leads)", () => {
  assert.strictEqual(buildLeadSearchUrl.length, 1);
});

test("booking list URL has no client-side assignee override", () => {
  const url = buildBookingsListUrl();
  const params = new URLSearchParams(url.split("?")[1]);
  assert.strictEqual(params.has("assigned_to"), false);
  assert.ok(url.startsWith("/bookings?"));
});

test("extractLeads and extractBookings accept paginated and array payloads", () => {
  assert.deepStrictEqual(extractLeads({ leads: [{ id: "1", name: "A" }] }), [{ id: "1", name: "A" }]);
  assert.deepStrictEqual(extractLeads([{ id: "2" }]), [{ id: "2" }]);
  assert.deepStrictEqual(extractLeads(null), []);
  assert.deepStrictEqual(extractBookings({ bookings: [{ id: "b1" }] }), [{ id: "b1" }]);
  assert.deepStrictEqual(extractBookings([{ id: "b2" }]), [{ id: "b2" }]);
});

test("booking jump matches hotel or lead name, case-insensitive", () => {
  const rows = [
    { id: "1", hotel_name: "Taj Palace", lead_name: "Ravi Kumar" },
    { id: "2", hotel_name: "Oberoi", lead_name: "Anita" },
    { id: "3", hotel_name: "Taj Lake Palace", lead_name: "Other" },
  ];
  assert.deepStrictEqual(
    filterBookingsByQuery(rows, "taj").map((b) => b.id),
    ["1", "3"]
  );
  assert.deepStrictEqual(
    filterBookingsByQuery(rows, "ANITA").map((b) => b.id),
    ["2"]
  );
  assert.deepStrictEqual(filterBookingsByQuery(rows, "  "), []);
});

test("jump paths go to lead detail and bookings highlight query", () => {
  assert.strictEqual(leadJumpPath("abc"), "/leads/abc");
  assert.strictEqual(bookingJumpPath("bk-1"), "/bookings?booking=bk-1");
});
