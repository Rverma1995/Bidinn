import assert from "assert";
import { parseReportRecipientEmails, warnIfNoReportRecipients } from "../../src/utils/report-recipients";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

test("empty / missing / whitespace-only yields []", () => {
  assert.deepStrictEqual(parseReportRecipientEmails(undefined), []);
  assert.deepStrictEqual(parseReportRecipientEmails(null), []);
  assert.deepStrictEqual(parseReportRecipientEmails(""), []);
  assert.deepStrictEqual(parseReportRecipientEmails("   "), []);
});

test("single address", () => {
  assert.deepStrictEqual(parseReportRecipientEmails("ops@bidinn.com"), ["ops@bidinn.com"]);
});

test("multiple addresses", () => {
  assert.deepStrictEqual(parseReportRecipientEmails("a@bidinn.com,b@bidinn.com"), [
    "a@bidinn.com",
    "b@bidinn.com",
  ]);
});

test("trims whitespace and drops empty comma slots", () => {
  assert.deepStrictEqual(parseReportRecipientEmails("  a@bidinn.com , , b@bidinn.com,  "), [
    "a@bidinn.com",
    "b@bidinn.com",
  ]);
});

test("trailing commas do not invent empty recipients", () => {
  assert.deepStrictEqual(parseReportRecipientEmails("a@bidinn.com,"), ["a@bidinn.com"]);
  assert.deepStrictEqual(parseReportRecipientEmails(",a@bidinn.com,,"), ["a@bidinn.com"]);
});

test("warnIfNoReportRecipients is true only when empty", () => {
  const original = console.warn;
  const warnings: string[] = [];
  console.warn = (msg?: unknown) => {
    warnings.push(String(msg));
  };
  try {
    assert.strictEqual(warnIfNoReportRecipients([]), true);
    assert.strictEqual(warnIfNoReportRecipients(["a@bidinn.com"]), false);
    assert.ok(warnings.some((w) => w.includes("REPORT_RECIPIENT_EMAILS")));
  } finally {
    console.warn = original;
  }
});

console.log("All report-recipient tests passed");
