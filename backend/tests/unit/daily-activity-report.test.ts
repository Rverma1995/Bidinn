import assert from "assert";
import {
  applyDailyReportCallScope,
  applyDailyReportLeadScope,
  isDailyReportAdmin,
  parseDailyActivityRange,
} from "../../src/services/daily-activity-report.service";
import { startOfCalendarMonth } from "../../src/utils/lead-scope";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

const now = new Date("2026-09-08T14:30:00");

test("isDailyReportAdmin is true only for admin role", () => {
  assert.strictEqual(isDailyReportAdmin({ id: "1", role: "admin" } as any), true);
  assert.strictEqual(isDailyReportAdmin({ id: "1", role: "manager" } as any), false);
  assert.strictEqual(isDailyReportAdmin({ id: "1", role: "team_lead" } as any), false);
  assert.strictEqual(isDailyReportAdmin({ id: "1", role: "sales_rep" } as any), false);
});

test("parseDailyActivityRange rejects invalid values", () => {
  assert.strictEqual(parseDailyActivityRange(undefined, now), null);
  assert.strictEqual(parseDailyActivityRange("all", now), null);
  assert.strictEqual(parseDailyActivityRange("7d", now), null);
});

test("parseDailyActivityRange: today starts at local midnight", () => {
  const result = parseDailyActivityRange("today", now);
  assert.ok(result);
  assert.strictEqual(result!.range, "today");
  assert.strictEqual(result!.start.getFullYear(), 2026);
  assert.strictEqual(result!.start.getMonth(), 8);
  assert.strictEqual(result!.start.getDate(), 8);
  assert.strictEqual(result!.start.getHours(), 0);
  assert.strictEqual(result!.end, now);
  assert.strictEqual(result!.label, "Today");
});

test("parseDailyActivityRange: week starts on Monday", () => {
  const result = parseDailyActivityRange("week", now);
  assert.ok(result);
  // 2026-09-08 is a Tuesday; week starts Monday 2026-09-07
  assert.strictEqual(result!.start.getFullYear(), 2026);
  assert.strictEqual(result!.start.getMonth(), 8);
  assert.strictEqual(result!.start.getDate(), 7);
  assert.strictEqual(result!.label, "This Week");
});

test("parseDailyActivityRange: month uses calendar month start", () => {
  const result = parseDailyActivityRange("month", now);
  assert.ok(result);
  const expected = startOfCalendarMonth(now);
  assert.strictEqual(result!.start.getTime(), expected.getTime());
  assert.strictEqual(result!.label, "This Month");
});

test("parseDailyActivityRange: year starts January 1", () => {
  const result = parseDailyActivityRange("year", now);
  assert.ok(result);
  assert.strictEqual(result!.start.getFullYear(), 2026);
  assert.strictEqual(result!.start.getMonth(), 0);
  assert.strictEqual(result!.start.getDate(), 1);
  assert.strictEqual(result!.label, "This Year");
});

test("parseDailyActivityRange: Sunday week still starts prior Monday", () => {
  const sunday = new Date("2026-09-13T10:00:00");
  const result = parseDailyActivityRange("week", sunday);
  assert.ok(result);
  assert.strictEqual(result!.start.getDate(), 7);
});

test("applyDailyReportLeadScope scopes non-admin to assigned leads", () => {
  const clauses: Array<{ sql: string; params?: unknown }> = [];
  const qb = {
    andWhere(sql: string, params?: unknown) {
      clauses.push({ sql, params });
      return qb;
    },
  };

  applyDailyReportLeadScope(qb as any, { id: "admin", role: "admin" } as any);
  assert.strictEqual(clauses.length, 0);

  applyDailyReportLeadScope(qb as any, { id: "rep", role: "sales_rep" } as any, "lead");
  assert.strictEqual(clauses.length, 1);
  assert.ok(clauses[0].sql.includes("lead.assigned_to = :dailyReportViewerId"));
  assert.deepStrictEqual(clauses[0].params, { dailyReportViewerId: "rep" });

  applyDailyReportLeadScope(qb as any, { id: "mgr", role: "manager" } as any, "lead");
  assert.strictEqual(clauses.length, 2);
});

test("applyDailyReportCallScope scopes non-admin to own calls", () => {
  const clauses: Array<{ sql: string; params?: unknown }> = [];
  const qb = {
    andWhere(sql: string, params?: unknown) {
      clauses.push({ sql, params });
      return qb;
    },
  };

  applyDailyReportCallScope(qb as any, { id: "tl", role: "team_lead" } as any, "call");
  assert.strictEqual(clauses.length, 1);
  assert.ok(clauses[0].sql.includes("call.user_id = :dailyReportViewerId"));
  assert.deepStrictEqual(clauses[0].params, { dailyReportViewerId: "tl" });
});

console.log("All daily-activity-report tests passed");
