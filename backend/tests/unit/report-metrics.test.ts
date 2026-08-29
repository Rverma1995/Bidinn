import assert from "assert";
import { LeadStatus, PaymentStatus } from "../../src/entities";
import {
  countPeriodMetrics,
  daysIdle,
  daysOverdue,
  daysBetween,
  formatInr,
  formatMinutesAsDuration,
  idleSinceDate,
  isIdleLead,
  isOverdueFollowup,
  isoDateStamp,
  rankAgents,
  rollupAgentDelay,
  DelayLeadInput,
} from "../../src/services/report-metrics";
import { previousCalendarMonth, priorDaysRange, startOfCalendarMonth } from "../../src/utils/lead-scope";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

const now = new Date("2026-08-29T10:00:00");

function lead(partial: Partial<DelayLeadInput> & { name: string; status: string; created_at: Date | string }): DelayLeadInput {
  return partial;
}

test("overdue follow-up matches dashboard: past next_followup, not won/lost", () => {
  const overdue = lead({
    name: "Ravi",
    status: LeadStatus.FOLLOWUP,
    created_at: "2026-08-01",
    next_followup: "2026-08-28T09:00:00",
  });
  assert.strictEqual(isOverdueFollowup(overdue, now), true);
  assert.strictEqual(daysOverdue(overdue, now), 1);

  assert.strictEqual(
    isOverdueFollowup(lead({ name: "Won", status: LeadStatus.WON, created_at: "2026-08-01", next_followup: "2026-08-01" }), now),
    false
  );
  assert.strictEqual(
    isOverdueFollowup(lead({ name: "Future", status: LeadStatus.FOLLOWUP, created_at: "2026-08-01", next_followup: "2026-08-30" }), now),
    false
  );
  assert.strictEqual(
    isOverdueFollowup(lead({ name: "None", status: LeadStatus.FOLLOWUP, created_at: "2026-08-01", next_followup: null }), now),
    false
  );
});

test("idle lead matches idle_lead job: 5+ days, not won/lost/not_interested", () => {
  const idle = lead({
    name: "Priya",
    status: LeadStatus.INTERESTED,
    created_at: "2026-08-01T10:00:00",
    last_activity: "2026-08-20T10:00:00",
  });
  assert.strictEqual(isIdleLead(idle, now), true);
  assert.strictEqual(daysIdle(idle, now), 9);

  const recent = lead({
    name: "New",
    status: LeadStatus.NEW,
    created_at: "2026-08-28T10:00:00",
    last_activity: null,
  });
  assert.strictEqual(isIdleLead(recent, now), false);

  const closed = lead({
    name: "Lost",
    status: LeadStatus.LOST,
    created_at: "2026-08-01",
    last_activity: "2026-08-01",
  });
  assert.strictEqual(isIdleLead(closed, now), false);
});

test("agent delay rollup counts overdue and idle per assignee", () => {
  const overdue = [
    lead({ name: "A", status: LeadStatus.FOLLOWUP, created_at: "2026-08-01", assigned_to: "u1", assigned_name: "Emily" }),
    lead({ name: "B", status: LeadStatus.FOLLOWUP, created_at: "2026-08-01", assigned_to: "u1", assigned_name: "Emily" }),
  ];
  const idle = [
    lead({ name: "C", status: LeadStatus.NEW, created_at: "2026-08-01", assigned_to: "u1", assigned_name: "Emily" }),
    lead({ name: "D", status: LeadStatus.NEW, created_at: "2026-08-01", assigned_to: "u2", assigned_name: "James" }),
    lead({ name: "E", status: LeadStatus.NEW, created_at: "2026-08-01", assigned_to: null, assigned_name: null }),
  ];
  const rows = rollupAgentDelay(overdue, idle);
  const emily = rows.find((r) => r.agent_id === "u1")!;
  const james = rows.find((r) => r.agent_id === "u2")!;
  const unassigned = rows.find((r) => r.agent_id === "unassigned")!;
  assert.strictEqual(emily.overdue_count, 2);
  assert.strictEqual(emily.idle_count, 1);
  assert.strictEqual(james.overdue_count, 0);
  assert.strictEqual(james.idle_count, 1);
  assert.strictEqual(unassigned.idle_count, 1);
});

test("period metrics match dashboard monthly definitions (updated_at close proxy, paid/partial revenue)", () => {
  const start = new Date("2026-08-01T00:00:00");
  const end = new Date("2026-09-01T00:00:00");
  const leads = [
    { source: "Website", status: LeadStatus.NEW, created_at: "2026-08-10", updated_at: "2026-08-10" },
    { source: "Website", status: LeadStatus.WON, created_at: "2026-07-20", updated_at: "2026-08-15" },
    { source: "Referral", status: LeadStatus.LOST, created_at: "2026-08-12", updated_at: "2026-08-20" },
    { source: "Website", status: LeadStatus.WON, created_at: "2026-08-02", updated_at: "2026-09-01T00:00:00" },
    { source: "Facebook", status: LeadStatus.NEW, created_at: "2026-07-31T23:59:59", updated_at: "2026-07-31" },
  ];
  const bookings = [
    { payment_status: PaymentStatus.PAID, payment_amount: 10000, created_at: "2026-08-15" },
    { payment_status: PaymentStatus.PARTIAL, payment_amount: 2500, created_at: "2026-08-20" },
    { payment_status: PaymentStatus.UNPAID, payment_amount: 9999, created_at: "2026-08-20" },
    { payment_status: PaymentStatus.PAID, payment_amount: 5000, created_at: "2026-09-01T00:00:00" },
  ];
  const metrics = countPeriodMetrics(leads, bookings, start, end);
  assert.strictEqual(metrics.new_leads, 3);
  assert.strictEqual(metrics.closed_won, 1);
  assert.strictEqual(metrics.closed_lost, 1);
  assert.strictEqual(metrics.revenue, 12500);
  assert.strictEqual(metrics.conversion_rate, 50);
  assert.deepStrictEqual(metrics.new_leads_by_source, [
    { source: "Website", count: 2 },
    { source: "Referral", count: 1 },
  ]);
});

test("month boundary: Aug 1 09:00 report covers July, not August", () => {
  const sent = new Date("2026-08-01T09:00:00");
  const { start, end } = previousCalendarMonth(sent);
  assert.strictEqual(start.getFullYear(), 2026);
  assert.strictEqual(start.getMonth(), 6);
  assert.strictEqual(start.getDate(), 1);
  assert.strictEqual(end.getFullYear(), 2026);
  assert.strictEqual(end.getMonth(), 7);
  assert.strictEqual(end.getDate(), 1);

  const julyClose = { source: "Website", status: LeadStatus.WON, created_at: "2026-07-10", updated_at: "2026-07-31T23:00:00" };
  const augClose = { source: "Website", status: LeadStatus.WON, created_at: "2026-07-10", updated_at: "2026-08-01T00:00:00" };
  const metrics = countPeriodMetrics([julyClose, augClose], [], start, end);
  assert.strictEqual(metrics.closed_won, 1);

  const jan1 = previousCalendarMonth(new Date("2026-01-01T09:00:00"));
  assert.strictEqual(jan1.start.getFullYear(), 2025);
  assert.strictEqual(jan1.start.getMonth(), 11);
  assert.strictEqual(jan1.end.getFullYear(), 2026);
  assert.strictEqual(jan1.end.getMonth(), 0);
});

test("Jul 31 send still reports June, not a partial July", () => {
  const { start, end } = previousCalendarMonth(new Date("2026-07-31T23:59:59"));
  assert.strictEqual(start.getMonth(), 5);
  assert.strictEqual(end.getMonth(), 6);
  assert.strictEqual(end.getDate(), 1);
});

test("prior 7 days is a half-open window ending at send time", () => {
  const send = new Date("2026-08-31T09:00:00");
  const { start, end } = priorDaysRange(send, 7);
  assert.strictEqual(end.getTime(), send.getTime());
  assert.strictEqual(start.getTime(), send.getTime() - 7 * 24 * 60 * 60 * 1000);
});

test("startOfCalendarMonth is day 1 of the current local month", () => {
  const start = startOfCalendarMonth(now);
  assert.strictEqual(start.getFullYear(), 2026);
  assert.strictEqual(start.getMonth(), 7);
  assert.strictEqual(start.getDate(), 1);
});

test("rankAgents excludes system and sorts by converted then revenue", () => {
  const { top, bottom } = rankAgents([
    { agent_id: "system", agent_name: "System", converted: 99, total_revenue: 0 },
    { agent_id: "a", agent_name: "Amy", converted: 2, total_revenue: 100 },
    { agent_id: "b", agent_name: "Ben", converted: 5, total_revenue: 50 },
    { agent_id: "c", agent_name: "Cam", converted: 2, total_revenue: 200 },
  ]);
  assert.strictEqual(top[0].agent_name, "Ben");
  assert.strictEqual(top[1].agent_name, "Cam");
  assert.strictEqual(bottom[0].agent_name, "Amy");
});

test("rankAgents n=1, empty list, and name tie-break", () => {
  assert.deepStrictEqual(rankAgents([], 3), { top: [], bottom: [] });
  const { top } = rankAgents(
    [
      { agent_id: "a", agent_name: "Amy", converted: 1, total_revenue: 10 },
      { agent_id: "b", agent_name: "Ben", converted: 1, total_revenue: 10 },
    ],
    1
  );
  assert.strictEqual(top.length, 1);
  assert.strictEqual(top[0].agent_name, "Amy");
});

test("not_interested is idle-excluded but still overdue if follow-up is past", () => {
  const ni = lead({
    name: "NI",
    status: LeadStatus.NOT_INTERESTED,
    created_at: "2026-08-01",
    last_activity: "2026-08-01",
    next_followup: "2026-08-20",
  });
  assert.strictEqual(isIdleLead(ni, now), false);
  assert.strictEqual(isOverdueFollowup(ni, now), true);
});

test("idle boundary: created exactly 5 days ago is not idle; one ms earlier is", () => {
  const cutoff = idleSinceDate(now);
  const onBoundary = lead({
    name: "Edge",
    status: LeadStatus.NEW,
    created_at: cutoff,
    last_activity: null,
  });
  assert.strictEqual(isIdleLead(onBoundary, now), false);

  const older = lead({
    name: "Older",
    status: LeadStatus.NEW,
    created_at: new Date(cutoff.getTime() - 1),
    last_activity: null,
  });
  assert.strictEqual(isIdleLead(older, now), true);
});

test("daysBetween null/invalid is 0", () => {
  assert.strictEqual(daysBetween(null, now), 0);
  assert.strictEqual(daysBetween("", now), 0);
  assert.strictEqual(daysBetween("not-a-date", now), 0);
});

test("period metrics: empty set conversion 0; unknown source; open-ended end", () => {
  const start = new Date("2026-08-01T00:00:00");
  const empty = countPeriodMetrics([], [], start, new Date("2026-09-01"));
  assert.strictEqual(empty.new_leads, 0);
  assert.strictEqual(empty.conversion_rate, 0);

  const unknown = countPeriodMetrics(
    [{ source: "  ", status: LeadStatus.NEW, created_at: "2026-08-10", updated_at: "2026-08-10" }],
    [],
    start,
    new Date("2026-09-01")
  );
  assert.deepStrictEqual(unknown.new_leads_by_source, [{ source: "Unknown", count: 1 }]);

  const openEnded = countPeriodMetrics(
    [{ source: "Website", status: LeadStatus.WON, created_at: "2026-08-10", updated_at: "2026-12-01" }],
    [],
    start
  );
  assert.strictEqual(openEnded.closed_won, 1);
});

test("formatMinutesAsDuration and formatInr edges", () => {
  assert.strictEqual(formatMinutesAsDuration(null), "—");
  assert.strictEqual(formatMinutesAsDuration(Number.NaN), "—");
  assert.strictEqual(formatMinutesAsDuration(0), "0m");
  assert.strictEqual(formatMinutesAsDuration(45), "45m");
  assert.strictEqual(formatMinutesAsDuration(60), "1h");
  assert.strictEqual(formatMinutesAsDuration(90), "1h 30m");
  assert.ok(formatInr(12500).includes("12,500") || formatInr(12500).includes("12500"));
  assert.ok(formatInr(0).startsWith("₹"));
});

test("isoDateStamp is YYYY-MM-DD in Asia/Kolkata", () => {
  const stamp = isoDateStamp(new Date("2026-08-01T03:30:00Z"));
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}$/);
});

test("rollupAgentDelay on empty lists is empty", () => {
  assert.deepStrictEqual(rollupAgentDelay([], []), []);
});

console.log("All report-metrics tests passed");
