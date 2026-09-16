import "reflect-metadata";
import assert from "assert";
import { CallOutcome } from "../../src/entities/Call";
import {
  callNeedsCdrResync,
  cdrRecordToPatch,
  formatSmartfloCdrDate,
  matchLiveCall,
  parseSmartfloIstDate,
  phonesMatchForCdr,
  pickSmartfloCdrRecord,
} from "../../src/services/tata-cdr";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

test("formatSmartfloCdrDate is Asia/Kolkata wall time", () => {
  const utc = new Date("2026-09-08T12:54:26.000Z");
  assert.strictEqual(formatSmartfloCdrDate(utc), "2026-09-08 18:24:26");
});

test("parseSmartfloIstDate treats naive stamps as IST", () => {
  const parsed = parseSmartfloIstDate("2026-09-08 18:24:55");
  assert.ok(parsed);
  assert.strictEqual(parsed!.toISOString(), "2026-09-08T12:54:55.000Z");
});

test("phonesMatchForCdr accepts +91, 91, and 10-digit forms", () => {
  assert.strictEqual(phonesMatchForCdr("+919565288935", "9565288935"), true);
  assert.strictEqual(phonesMatchForCdr("919565288935", "9565288935"), true);
  assert.strictEqual(phonesMatchForCdr("9565288935", "9240202666"), false);
});

test("pickSmartfloCdrRecord prefers matching ref_id", () => {
  const rows = [
    { ref_id: "other", client_number: "+919565288935", end_stamp: "2026-09-08 18:20:00" },
    { ref_id: "b413fc28-a088-4c7e-87d3-5137be9ce362", client_number: "+919111111111", end_stamp: "2026-09-08 18:24:55" },
  ];
  const picked = pickSmartfloCdrRecord(rows, {
    tataCallId: "b413fc28-a088-4c7e-87d3-5137be9ce362",
    customerPhone: "+919565288935",
    startedMs: Date.parse("2026-09-08T12:54:26.000Z"),
  });
  assert.strictEqual(picked?.ref_id, "b413fc28-a088-4c7e-87d3-5137be9ce362");
});

test("pickSmartfloCdrRecord does not attach another call's CDR", () => {
  const rows = [
    {
      ref_id: "previous-call",
      client_number: "+919565288935",
      date: "2026-09-08",
      time: "18:24:21",
      end_stamp: "2026-09-08 18:24:55",
    },
  ];
  const picked = pickSmartfloCdrRecord(rows, {
    tataCallId: "live-call",
    customerPhone: "+919565288935",
    startedMs: Date.parse("2026-09-08T12:54:26.000Z"),
  });
  assert.strictEqual(picked, null);
});

test("cdrRecordToPatch maps missed-by-customer to no_answer", () => {
  const patch = cdrRecordToPatch(
    {
      status: "missed",
      description: "Call missed by customer",
      answered_seconds: 0,
      call_duration: 30,
      end_stamp: "2026-09-08 18:24:55",
      date: "2026-09-08",
      time: "18:24:21",
      recording_url: "https://example.com/rec.mp3",
    },
    new Date("2026-09-08T12:54:26.000Z")
  );
  assert.strictEqual(patch.outcome, CallOutcome.NO_ANSWER);
  assert.strictEqual(patch.wrap_up_completed, true);
  assert.strictEqual(patch.answered_at, null);
  assert.ok(patch.ended_at);
  assert.strictEqual(patch.ended_at!.toISOString(), "2026-09-08T12:54:55.000Z");
  assert.strictEqual(patch.duration_seconds, 30);
  assert.strictEqual(patch.duration_minutes, 0);
  assert.strictEqual(patch.recording_url, "https://example.com/rec.mp3");
});

test("cdrRecordToPatch maps answered to connected and defers wrap-up", () => {
  const patch = cdrRecordToPatch(
    {
      status: "answered",
      description: "Call answered by customer",
      answered_seconds: 67,
      call_duration: 75,
      end_stamp: "2026-09-08 18:16:48",
      date: "2026-09-08",
      time: "18:15:24",
    },
    new Date("2026-09-08T12:45:00.000Z")
  );
  assert.strictEqual(patch.outcome, CallOutcome.CONNECTED);
  assert.strictEqual(patch.wrap_up_completed, false);
  assert.ok(patch.answered_at);
  assert.ok(patch.ended_at);
  assert.strictEqual(patch.duration_seconds, 67);
});

test("callNeedsCdrResync flags ended before started", () => {
  assert.strictEqual(
    callNeedsCdrResync({
      tata_call_id: "x",
      started_at: new Date("2026-09-16T03:40:31.000Z"),
      ended_at: new Date("2026-09-16T03:40:22.000Z"),
      outcome: CallOutcome.NO_ANSWER,
    }),
    true
  );
});

test("callNeedsCdrResync does not loop on missed calls that have a recording", () => {
  assert.strictEqual(
    callNeedsCdrResync({
      tata_call_id: "x",
      started_at: new Date("2026-09-16T03:39:37.000Z"),
      ended_at: new Date("2026-09-16T03:40:22.000Z"),
      outcome: CallOutcome.NO_ANSWER,
      recording_url: "https://example.com/rec.mp3",
    }),
    false
  );
});

test("matchLiveCall finds click-to-call by customer number", () => {
  const matched = matchLiveCall(
    [
      {
        type: "click-to-call",
        state: "Ringing",
        customer_number: "09565288935",
        destination: "+919565288935",
        source: "0606665530054",
      },
    ],
    { customerPhone: "+919565288935", agentExtension: "0606665530054" }
  );
  assert.ok(matched);
  assert.strictEqual(matched!.state, "calling_customer");
});

test("matchLiveCall maps Answered to live", () => {
  const matched = matchLiveCall(
    [{ type: "click-to-call", state: "Answered", customer_number: "09773969295" }],
    { customerPhone: "9773969295" }
  );
  assert.ok(matched);
  assert.strictEqual(matched!.state, "live");
});

console.log("All Tata CDR tests passed");
