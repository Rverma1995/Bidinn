import "reflect-metadata";
import assert from "assert";
import { signTataPayload, verifyTataWebhookSignature } from "../../src/services/tata.service";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

const BODY = '{"event":"call.ended","data":{"call_id":"uuid-1"}}';
const SECRET = "unit-webhook-secret";

function withSecret(value: string | undefined, fn: () => void) {
  const original = process.env.TATA_SMARTFLO_WEBHOOK_SECRET;
  if (value === undefined) {
    delete process.env.TATA_SMARTFLO_WEBHOOK_SECRET;
  } else {
    process.env.TATA_SMARTFLO_WEBHOOK_SECRET = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) delete process.env.TATA_SMARTFLO_WEBHOOK_SECRET;
    else process.env.TATA_SMARTFLO_WEBHOOK_SECRET = original;
  }
}

test("valid HMAC with sha256= prefix is accepted", () => {
  withSecret(SECRET, () => {
    const sig = signTataPayload(BODY, SECRET);
    assert.ok(sig.startsWith("sha256="));
    assert.strictEqual(verifyTataWebhookSignature(BODY, sig), true);
    assert.strictEqual(verifyTataWebhookSignature(Buffer.from(BODY), sig), true);
  });
});

test("hex without sha256= prefix is still accepted", () => {
  withSecret(SECRET, () => {
    const sig = signTataPayload(BODY, SECRET);
    const hex = sig.replace(/^sha256=/, "");
    assert.strictEqual(verifyTataWebhookSignature(BODY, hex), true);
  });
});

test("wrong signature, truncated signature, and missing header are rejected when secret is set", () => {
  withSecret(SECRET, () => {
    assert.strictEqual(verifyTataWebhookSignature(BODY, "sha256=deadbeef"), false);
    assert.strictEqual(verifyTataWebhookSignature(BODY, "sha256=ab"), false);
    assert.strictEqual(verifyTataWebhookSignature(BODY, undefined), false);
    assert.strictEqual(verifyTataWebhookSignature(BODY, ""), false);
  });
});

test("tampered body fails even with a previously valid signature", () => {
  withSecret(SECRET, () => {
    const sig = signTataPayload(BODY, SECRET);
    assert.strictEqual(verifyTataWebhookSignature(BODY + " ", sig), false);
  });
});

test("when webhook secret is not configured, any payload is allowed (local/dev)", () => {
  withSecret("", () => {
    assert.strictEqual(verifyTataWebhookSignature(BODY, undefined), true);
    assert.strictEqual(verifyTataWebhookSignature(BODY, "sha256=deadbeef"), true);
  });
  withSecret(undefined, () => {
    assert.strictEqual(verifyTataWebhookSignature(BODY, undefined), true);
  });
});

console.log("All Tata webhook signature tests passed");
