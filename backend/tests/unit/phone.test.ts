import assert from "assert";
import { normalizePhone, toE164, secondsToMinutes } from "../../src/utils/phone";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

test("already-bare 10-digit number", () => {
  assert.strictEqual(normalizePhone("9876543210"), "9876543210");
});

test("with +91 prefix", () => {
  assert.strictEqual(normalizePhone("+919876543210"), "9876543210");
});

test("with 91 prefix, no plus", () => {
  assert.strictEqual(normalizePhone("919876543210"), "9876543210");
});

test("with leading trunk 0", () => {
  assert.strictEqual(normalizePhone("09876543210"), "9876543210");
});

test("with spaces and dashes", () => {
  assert.strictEqual(normalizePhone("98765 43210"), "9876543210");
  assert.strictEqual(normalizePhone("98765-43210"), "9876543210");
  assert.strictEqual(normalizePhone("+91 98765-43210"), "9876543210");
});

test("with parentheses", () => {
  assert.strictEqual(normalizePhone("(+91) 98765 43210"), "9876543210");
});

test("10-digit number starting with 91 is not stripped", () => {
  // 9123456789 is a valid 10-digit Indian mobile, not a country-code prefix
  assert.strictEqual(normalizePhone("9123456789"), "9123456789");
});

test("+91 with trunk 0", () => {
  assert.strictEqual(normalizePhone("+91 09876543210"), "9876543210");
});

test("empty / null / formatting-only", () => {
  assert.strictEqual(normalizePhone(""), "");
  assert.strictEqual(normalizePhone(null), "");
  assert.strictEqual(normalizePhone(undefined), "");
  assert.strictEqual(normalizePhone("   ---   "), "");
});

test("non-Indian numbers keep remaining digits", () => {
  assert.strictEqual(normalizePhone("+1-555-111-0001"), "15551110001");
});

test("toE164 for Indian 10-digit", () => {
  assert.strictEqual(toE164("9876543210"), "+919876543210");
  assert.strictEqual(toE164("+91 98765-43210"), "+919876543210");
});

test("toE164 empty / already-plus / non-Indian", () => {
  assert.strictEqual(toE164(""), "");
  assert.strictEqual(toE164(null), "");
  assert.strictEqual(toE164(undefined), "");
  assert.strictEqual(toE164("+1-555-111-0001"), "+15551110001");
  assert.strictEqual(toE164("15551110001"), "+15551110001");
});

test("secondsToMinutes", () => {
  assert.strictEqual(secondsToMinutes(300), 5);
  assert.strictEqual(secondsToMinutes(0), 0);
  assert.strictEqual(secondsToMinutes(20), 1);
  assert.strictEqual(secondsToMinutes(undefined), 0);
});

test("secondsToMinutes edges: null, NaN, negative, sub-minute, half-up", () => {
  assert.strictEqual(secondsToMinutes(null), 0);
  assert.strictEqual(secondsToMinutes(Number.NaN), 0);
  assert.strictEqual(secondsToMinutes(-12), 0);
  assert.strictEqual(secondsToMinutes(1), 1);
  assert.strictEqual(secondsToMinutes(59), 1);
  assert.strictEqual(secondsToMinutes(90), 2);
  assert.strictEqual(secondsToMinutes("180" as unknown as number), 3);
});

test("letters mixed into a number still extract digits", () => {
  assert.strictEqual(normalizePhone("tel:98765abc43210"), "9876543210");
});

console.log("All normalizePhone tests passed");
