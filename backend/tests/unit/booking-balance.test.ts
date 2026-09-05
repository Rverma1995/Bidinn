import assert from "assert";
import { remainingBalance, withRemainingBalance } from "../../src/utils/booking-balance";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

test("unpaid booking remaining_balance equals final_price", () => {
  assert.strictEqual(remainingBalance(10000, 0), 10000);
  assert.strictEqual(remainingBalance("10000.00", "0"), 10000);
});

test("partial collection subtracts payment_amount", () => {
  assert.strictEqual(remainingBalance(10000, 3500), 6500);
  assert.strictEqual(remainingBalance(999.99, 0.09), 999.9);
});

test("paid in full is 0", () => {
  assert.strictEqual(remainingBalance(5000, 5000), 0);
});

test("overpayment does not go negative", () => {
  assert.strictEqual(remainingBalance(5000, 8000), 0);
  assert.strictEqual(remainingBalance(1, 1.004), 0);
});

test("null / empty / garbage coerce to 0 remaining of 0", () => {
  assert.strictEqual(remainingBalance(null, null), 0);
  assert.strictEqual(remainingBalance(undefined, undefined), 0);
  assert.strictEqual(remainingBalance("", ""), 0);
  assert.strictEqual(remainingBalance("abc", 10), 0);
  assert.strictEqual(remainingBalance(10, "abc"), 10);
});

test("rounds to two decimal places (paise)", () => {
  assert.strictEqual(remainingBalance(10.126, 0), 10.13);
  assert.strictEqual(remainingBalance(10.1, 0.03), 10.07);
});

test("withRemainingBalance attaches the field without mutating the original object identity extras", () => {
  const booking = { id: "b1", final_price: 12000, payment_amount: 2000 };
  const out = withRemainingBalance(booking);
  assert.strictEqual(out.id, "b1");
  assert.strictEqual(out.remaining_balance, 10000);
  assert.strictEqual(booking.final_price, 12000);
});

console.log("All booking-balance tests passed");
