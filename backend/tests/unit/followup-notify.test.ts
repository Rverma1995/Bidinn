import assert from "assert";
import { NotificationType } from "../../src/entities";
import {
  FOLLOWUP_EXCLUDE_STATUSES,
  FOLLOWUP_MISSED_LOOKBACK_MS,
  FOLLOWUP_UPCOMING_WINDOW_MS,
  buildFollowupNotice,
  followupDedupKey,
  formatOverdueLabel,
  isExcludedFollowupStatus,
  isInMissedFollowupWindow,
  isInUpcomingFollowupWindow,
  shouldNotifyFollowupAssignee,
} from "../../src/utils/followup-notify";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

const now = new Date("2026-08-29T12:00:00");

test("only the assigned agent is eligible — unassigned / empty / null skip", () => {
  assert.strictEqual(shouldNotifyFollowupAssignee({ assigned_to: "rep-1" }), true);
  assert.strictEqual(shouldNotifyFollowupAssignee({ assigned_to: null }), false);
  assert.strictEqual(shouldNotifyFollowupAssignee({ assigned_to: undefined }), false);
  assert.strictEqual(shouldNotifyFollowupAssignee({ assigned_to: "" }), false);
  assert.strictEqual(shouldNotifyFollowupAssignee({} as any), false);
});

test("won and lost are excluded from follow-up reminders; other stages are not", () => {
  assert.deepStrictEqual([...FOLLOWUP_EXCLUDE_STATUSES], ["won", "lost"]);
  assert.strictEqual(isExcludedFollowupStatus("won"), true);
  assert.strictEqual(isExcludedFollowupStatus("lost"), true);
  assert.strictEqual(isExcludedFollowupStatus("followup"), false);
  assert.strictEqual(isExcludedFollowupStatus("not_interested"), false);
  assert.strictEqual(isExcludedFollowupStatus("new"), false);
  assert.strictEqual(isExcludedFollowupStatus(null), false);
});

test("upcoming window is (now, now+60m] — exclusive of now, inclusive of 60 minutes", () => {
  assert.strictEqual(isInUpcomingFollowupWindow(new Date(now.getTime() + 1), now), true);
  assert.strictEqual(isInUpcomingFollowupWindow(new Date(now.getTime() + 30 * 60 * 1000), now), true);
  assert.strictEqual(isInUpcomingFollowupWindow(new Date(now.getTime() + FOLLOWUP_UPCOMING_WINDOW_MS), now), true);
  assert.strictEqual(isInUpcomingFollowupWindow(now, now), false);
  assert.strictEqual(isInUpcomingFollowupWindow(new Date(now.getTime() - 1000), now), false);
  assert.strictEqual(isInUpcomingFollowupWindow(new Date(now.getTime() + FOLLOWUP_UPCOMING_WINDOW_MS + 1), now), false);
});

test("upcoming window rejects null, empty, and invalid dates", () => {
  assert.strictEqual(isInUpcomingFollowupWindow(null, now), false);
  assert.strictEqual(isInUpcomingFollowupWindow("", now), false);
  assert.strictEqual(isInUpcomingFollowupWindow("not-a-date", now), false);
});

test("missed window is [now-24h, now) — older than 24h is not re-notified", () => {
  assert.strictEqual(isInMissedFollowupWindow(new Date(now.getTime() - 1000), now), true);
  assert.strictEqual(isInMissedFollowupWindow(new Date(now.getTime() - 12 * 60 * 60 * 1000), now), true);
  assert.strictEqual(isInMissedFollowupWindow(new Date(now.getTime() - FOLLOWUP_MISSED_LOOKBACK_MS + 1), now), true);
  assert.strictEqual(isInMissedFollowupWindow(new Date(now.getTime() - FOLLOWUP_MISSED_LOOKBACK_MS), now), false);
  assert.strictEqual(isInMissedFollowupWindow(new Date(now.getTime() - FOLLOWUP_MISSED_LOOKBACK_MS - 1), now), false);
  assert.strictEqual(isInMissedFollowupWindow(now, now), false);
  assert.strictEqual(isInMissedFollowupWindow(new Date(now.getTime() + 1000), now), false);
  assert.strictEqual(isInMissedFollowupWindow(null, now), false);
  assert.strictEqual(isInMissedFollowupWindow("bad", now), false);
});

test("upcoming and missed windows do not overlap", () => {
  const times = [
    new Date(now.getTime() - FOLLOWUP_MISSED_LOOKBACK_MS - 1),
    new Date(now.getTime() - 60 * 1000),
    now,
    new Date(now.getTime() + 60 * 1000),
    new Date(now.getTime() + FOLLOWUP_UPCOMING_WINDOW_MS + 1),
  ];
  for (const t of times) {
    assert.strictEqual(
      isInUpcomingFollowupWindow(t, now) && isInMissedFollowupWindow(t, now),
      false,
      `overlap at ${t.toISOString()}`
    );
  }
});

test("dedup key is userId_leadId so admins are not a second recipient slot", () => {
  assert.strictEqual(followupDedupKey("rep-1", "lead-9"), "rep-1_lead-9");
  assert.notStrictEqual(followupDedupKey("admin", "lead-9"), followupDedupKey("rep-1", "lead-9"));
});

test("upcoming notice title uses minutes until follow-up", () => {
  const followupTime = new Date(now.getTime() + 25 * 60 * 1000);
  const notice = buildFollowupNotice({
    type: NotificationType.FOLLOWUP_UPCOMING,
    leadName: "Amit Patel",
    leadPhone: "9000011111",
    followupTime,
    now,
  });
  assert.strictEqual(notice.title, "Upcoming Follow-up in 25 min");
  assert.ok(notice.message.includes("Amit Patel"));
  assert.ok(notice.message.includes("9000011111"));
  assert.ok(!notice.message.includes("Assigned to"), "assignee-only copy must not mention another agent");
  assert.strictEqual(notice.overdueMinutes, undefined);
});

test("missed notice under 60 minutes uses m; at 60+ uses h", () => {
  const forty = buildFollowupNotice({
    type: NotificationType.FOLLOWUP_MISSED,
    leadName: "Neha",
    leadPhone: "9000022222",
    followupTime: new Date(now.getTime() - 40 * 60 * 1000),
    now,
  });
  assert.strictEqual(forty.title, "Missed Follow-up (40m overdue)");
  assert.strictEqual(forty.overdueMinutes, 40);
  assert.ok(forty.message.includes("that was missed"));

  const twoHours = buildFollowupNotice({
    type: "followup_missed",
    leadName: "Neha",
    leadPhone: "9000022222",
    followupTime: new Date(now.getTime() - 120 * 60 * 1000),
    now,
  });
  assert.strictEqual(twoHours.title, "Missed Follow-up (2h overdue)");
  assert.strictEqual(twoHours.overdueMinutes, 120);
});

test("formatOverdueLabel 59m vs 60m vs 90m rounding", () => {
  assert.strictEqual(formatOverdueLabel(0), "0m");
  assert.strictEqual(formatOverdueLabel(59), "59m");
  assert.strictEqual(formatOverdueLabel(60), "1h");
  assert.strictEqual(formatOverdueLabel(89), "1h");
  assert.strictEqual(formatOverdueLabel(90), "2h");
});

console.log("All followup-notify tests passed");
