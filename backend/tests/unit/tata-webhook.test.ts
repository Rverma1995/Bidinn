import "reflect-metadata";
import assert from "assert";
import { CallOutcome } from "../../src/entities/Call";
import { pickMostRecentlyActive, PhoneMatchLead } from "../../src/services/phone-match.service";
import {
  extractCustomerNumber,
  mapTataStatusToOutcome,
  mergeWebhookEvent,
  isTerminalEvent,
  CallSnapshot,
  TataWebhookPayload,
} from "../../src/services/tata-webhook";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

function lead(partial: Partial<PhoneMatchLead> & { id: string }): PhoneMatchLead {
  return {
    name: partial.name || partial.id,
    phone: "9876543210",
    last_activity: null,
    updated_at: new Date("2025-01-01"),
    created_at: new Date("2025-01-01"),
    ...partial,
  };
}

test("no-match: empty list is unmatched, not dropped as a void", () => {
  const result = pickMostRecentlyActive([]);
  assert.strictEqual(result.lead, null);
  assert.strictEqual(result.unmatched, true);
  assert.strictEqual(result.ambiguous, false);
});

test("single match: attach that lead, not ambiguous", () => {
  const a = lead({ id: "a", last_activity: new Date("2025-06-01") });
  const result = pickMostRecentlyActive([a]);
  assert.strictEqual(result.lead?.id, "a");
  assert.strictEqual(result.unmatched, false);
  assert.strictEqual(result.ambiguous, false);
});

test("multiple matches: most recently active wins, ambiguity flagged", () => {
  const older = lead({ id: "older", last_activity: new Date("2025-01-01"), name: "Older" });
  const newer = lead({ id: "newer", last_activity: new Date("2025-08-01"), name: "Newer" });
  const result = pickMostRecentlyActive([older, newer]);
  assert.strictEqual(result.lead?.id, "newer");
  assert.strictEqual(result.ambiguous, true);
  assert.strictEqual(result.all.length, 2);
});

test("multiple matches fall back to created_at when last_activity is null", () => {
  const first = lead({
    id: "first",
    last_activity: null,
    updated_at: new Date("2024-01-01"),
    created_at: new Date("2024-01-01"),
  });
  const second = lead({
    id: "second",
    last_activity: null,
    updated_at: new Date("2025-01-01"),
    created_at: new Date("2025-01-01"),
  });
  const result = pickMostRecentlyActive([first, second]);
  assert.strictEqual(result.lead?.id, "second");
  assert.strictEqual(result.ambiguous, true);
});

test("map Tata statuses onto existing CallOutcome enum", () => {
  assert.strictEqual(mapTataStatusToOutcome("answered", "call.ended", 300), CallOutcome.CONNECTED);
  assert.strictEqual(mapTataStatusToOutcome("no_answer", "call.ended"), CallOutcome.NO_ANSWER);
  assert.strictEqual(mapTataStatusToOutcome("busy"), CallOutcome.BUSY);
  assert.strictEqual(mapTataStatusToOutcome("voicemail"), CallOutcome.VOICEMAIL);
  assert.strictEqual(mapTataStatusToOutcome(undefined, "call.missed"), CallOutcome.NO_ANSWER);
  assert.strictEqual(mapTataStatusToOutcome(undefined, "call.ended", 0), CallOutcome.NO_ANSWER);
  assert.strictEqual(mapTataStatusToOutcome(undefined, "call.ended", 120), CallOutcome.CONNECTED);
});

test("extractCustomerNumber inbound vs outbound", () => {
  assert.strictEqual(
    extractCustomerNumber({ caller_number: "+919876543210", called_number: "+911234567890" }, "inbound"),
    "+919876543210"
  );
  assert.strictEqual(
    extractCustomerNumber({ caller_number: "+911001", called_number: "+919876543210" }, "outbound"),
    "+919876543210"
  );
});

function applySequence(events: TataWebhookPayload[]): CallSnapshot {
  let snap: CallSnapshot | null = null;
  for (const event of events) {
    snap = mergeWebhookEvent(snap, event);
  }
  return snap!;
}

const CALL_ID = "uuid-12345";

test("in-order started → answered → ended yields one snapshot with recording", () => {
  const snap = applySequence([
    {
      event: "call.started",
      timestamp: "2025-12-16T10:30:00Z",
      data: {
        call_id: CALL_ID,
        direction: "outbound",
        caller_number: "+911001",
        called_number: "+919876543210",
        agent_number: "1001",
        reference_id: "lead_abc123",
      },
    },
    {
      event: "call.answered",
      timestamp: "2025-12-16T10:30:08Z",
      data: { call_id: CALL_ID },
    },
    {
      event: "call.ended",
      timestamp: "2025-12-16T10:35:00Z",
      data: {
        call_id: CALL_ID,
        direction: "outbound",
        duration: 300,
        status: "answered",
        recording_url: "https://recordings.smartflo.com/uuid-12345.mp3",
        hangup_cause: "normal_clearing",
      },
    },
  ]);

  assert.strictEqual(snap.tata_call_id, CALL_ID);
  assert.strictEqual(snap.direction, "outbound");
  assert.strictEqual(snap.outcome, CallOutcome.CONNECTED);
  assert.strictEqual(snap.duration_minutes, 5);
  assert.strictEqual(snap.recording_url, "https://recordings.smartflo.com/uuid-12345.mp3");
  assert.ok(snap.started_at);
  assert.ok(snap.answered_at);
  assert.ok(snap.ended_at);
  assert.strictEqual(snap.lead_id, "lead_abc123");
  assert.strictEqual(snap.customer_phone, "+919876543210");
});

test("out-of-order ended → started still one row, fields unioned", () => {
  const snap = applySequence([
    {
      event: "call.ended",
      timestamp: "2025-12-16T10:35:00Z",
      data: {
        call_id: CALL_ID,
        duration: 180,
        status: "answered",
        recording_url: "https://recordings.smartflo.com/late.mp3",
      },
    },
    {
      event: "call.started",
      timestamp: "2025-12-16T10:30:00Z",
      data: {
        call_id: CALL_ID,
        direction: "inbound",
        caller_number: "+919876543210",
        agent_number: "1001",
      },
    },
    {
      event: "call.answered",
      timestamp: "2025-12-16T10:30:05Z",
      data: { call_id: CALL_ID },
    },
  ]);

  assert.strictEqual(snap.tata_call_id, CALL_ID);
  assert.strictEqual(snap.direction, "inbound");
  assert.strictEqual(snap.outcome, CallOutcome.CONNECTED);
  assert.strictEqual(snap.recording_url, "https://recordings.smartflo.com/late.mp3");
  assert.strictEqual(snap.duration_minutes, 3);
  assert.ok(snap.started_at);
  assert.ok(snap.answered_at);
  assert.ok(snap.ended_at);
  assert.strictEqual(snap.customer_phone, "+919876543210");
});

test("duplicate ended does not fork a second identity", () => {
  const first = mergeWebhookEvent(null, {
    event: "call.ended",
    timestamp: "2025-12-16T10:35:00Z",
    data: { call_id: CALL_ID, duration: 60, status: "answered" },
  });
  const second = mergeWebhookEvent(first, {
    event: "call.ended",
    timestamp: "2025-12-16T10:36:00Z",
    data: { call_id: CALL_ID, duration: 60, status: "answered" },
  });
  assert.strictEqual(first.tata_call_id, second.tata_call_id);
  assert.strictEqual(second.outcome, CallOutcome.CONNECTED);
});

test("call.missed maps to no_answer", () => {
  const snap = mergeWebhookEvent(null, {
    event: "call.missed",
    timestamp: "2025-12-16T10:31:00Z",
    data: { call_id: CALL_ID, direction: "inbound", caller_number: "+919876543210" },
  });
  assert.strictEqual(snap.outcome, CallOutcome.NO_ANSWER);
  assert.ok(snap.ended_at);
});

test("map Tata status aliases including wrong_number and callback", () => {
  assert.strictEqual(mapTataStatusToOutcome("completed"), CallOutcome.CONNECTED);
  assert.strictEqual(mapTataStatusToOutcome("connected"), CallOutcome.CONNECTED);
  assert.strictEqual(mapTataStatusToOutcome("success"), CallOutcome.CONNECTED);
  assert.strictEqual(mapTataStatusToOutcome("unanswered"), CallOutcome.NO_ANSWER);
  assert.strictEqual(mapTataStatusToOutcome("missed"), CallOutcome.NO_ANSWER);
  assert.strictEqual(mapTataStatusToOutcome("not_answered"), CallOutcome.NO_ANSWER);
  assert.strictEqual(mapTataStatusToOutcome("wrong_number"), CallOutcome.WRONG_NUMBER);
  assert.strictEqual(mapTataStatusToOutcome("invalid"), CallOutcome.WRONG_NUMBER);
  assert.strictEqual(mapTataStatusToOutcome("callback"), CallOutcome.CALLBACK_REQUESTED);
  assert.strictEqual(mapTataStatusToOutcome("callback requested"), CallOutcome.CALLBACK_REQUESTED);
});

test("ended with duration 0 and no status is no_answer; sub-minute duration still 1 minute", () => {
  const zero = mergeWebhookEvent(null, {
    event: "call.ended",
    data: { call_id: CALL_ID, duration: 0 },
  });
  assert.strictEqual(zero.outcome, CallOutcome.NO_ANSWER);
  assert.strictEqual(zero.duration_minutes, 0);

  const short = mergeWebhookEvent(null, {
    event: "call.ended",
    data: { call_id: CALL_ID, duration: 20, status: "answered" },
  });
  assert.strictEqual(short.duration_minutes, 1);
  assert.strictEqual(short.outcome, CallOutcome.CONNECTED);
});

test("unknown event does not overwrite an existing snapshot identity", () => {
  const started = mergeWebhookEvent(null, {
    event: "call.started",
    timestamp: "2025-12-16T10:30:00Z",
    data: { call_id: CALL_ID, direction: "outbound", called_number: "+919876543210" },
  });
  const unknown = mergeWebhookEvent(started, {
    event: "call.unknown" as any,
    data: { call_id: CALL_ID },
  });
  assert.strictEqual(unknown.tata_call_id, CALL_ID);
  assert.strictEqual(unknown.direction, "outbound");
  assert.strictEqual(unknown.outcome, null);
  assert.ok(unknown.started_at);
});

test("later started event does not wipe recording_url or started_at", () => {
  const ended = mergeWebhookEvent(null, {
    event: "call.ended",
    timestamp: "2025-12-16T10:35:00Z",
    data: {
      call_id: CALL_ID,
      duration: 60,
      status: "answered",
      recording_url: "https://recordings.smartflo.com/keep.mp3",
    },
  });
  const started = mergeWebhookEvent(ended, {
    event: "call.started",
    timestamp: "2025-12-16T10:30:00Z",
    data: { call_id: CALL_ID, direction: "inbound", caller_number: "+919876543210" },
  });
  assert.strictEqual(started.recording_url, "https://recordings.smartflo.com/keep.mp3");
  assert.strictEqual(started.ended_at!.toISOString(), ended.ended_at!.toISOString());
  assert.strictEqual(started.customer_phone, "+919876543210");
});

test("extractCustomerNumber with no direction falls back to customer/caller/called", () => {
  assert.strictEqual(extractCustomerNumber(undefined, "inbound"), "");
  assert.strictEqual(
    extractCustomerNumber({ customer_number: "+919800011111" }, null),
    "+919800011111"
  );
  assert.strictEqual(
    extractCustomerNumber({ caller_number: "+919800022222", called_number: "+91100" }, ""),
    "+919800022222"
  );
});

test("isTerminalEvent only ended and missed", () => {
  assert.strictEqual(isTerminalEvent("call.ended"), true);
  assert.strictEqual(isTerminalEvent("call.missed"), true);
  assert.strictEqual(isTerminalEvent("call.started"), false);
  assert.strictEqual(isTerminalEvent("call.answered"), false);
  assert.strictEqual(isTerminalEvent(undefined), false);
});

test("pickMostRecentlyActive treats invalid dates as oldest and still flags ambiguity", () => {
  const bad = lead({ id: "bad", last_activity: "not-a-date" as unknown as Date });
  const good = lead({ id: "good", last_activity: new Date("2026-01-01") });
  const result = pickMostRecentlyActive([bad, good]);
  assert.strictEqual(result.lead?.id, "good");
  assert.strictEqual(result.ambiguous, true);
});

test("missing call_id still produces a snapshot object (upsert rejects separately)", () => {
  const snap = mergeWebhookEvent(null, { event: "call.started", data: {} });
  assert.strictEqual(snap.tata_call_id, "");
});

console.log("All Tata webhook / phone-match tests passed");
