import assert from "assert";
import { CallOutcome } from "../../src/entities";
import { isAnsweredCall, needsCallWrapUp } from "../../src/services/call-wrap-up.service";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

test("isAnsweredCall is true when answered_at is set", () => {
  assert.strictEqual(isAnsweredCall({ answered_at: new Date() } as any), true);
  assert.strictEqual(isAnsweredCall({ answered_at: null, duration_minutes: 0 } as any), false);
});

test("needsCallWrapUp requires answered ended call without wrap-up", () => {
  assert.strictEqual(
    needsCallWrapUp({
      answered_at: new Date(),
      ended_at: new Date(),
      wrap_up_completed: false,
      outcome: CallOutcome.CONNECTED,
      duration_minutes: 2,
    } as any),
    true
  );
  assert.strictEqual(
    needsCallWrapUp({
      answered_at: new Date(),
      ended_at: new Date(),
      wrap_up_completed: true,
    } as any),
    false
  );
  assert.strictEqual(
    needsCallWrapUp({
      answered_at: null,
      ended_at: new Date(),
      wrap_up_completed: false,
    } as any),
    false
  );
});

console.log("All call-wrap-up tests passed");
