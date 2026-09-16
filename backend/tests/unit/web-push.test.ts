import assert from "assert";
import { cacheControlForStaticFile } from "../../src/utils/static-cache";
import { buildPushPayload, isWebPushConfigured, shouldDropSubscription } from "../../src/services/web-push.service";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

test("index.html, service-worker.js, and manifest are never HTTP-cached (deploy cache-bust)", () => {
  const noStore = "no-cache, no-store, must-revalidate";
  assert.strictEqual(cacheControlForStaticFile("/var/app/frontend/build/index.html"), noStore);
  assert.strictEqual(cacheControlForStaticFile("/var/app/frontend/build/service-worker.js"), noStore);
  assert.strictEqual(cacheControlForStaticFile("/var/app/frontend/build/manifest.json"), noStore);
  assert.strictEqual(cacheControlForStaticFile("/var/app/frontend/build/asset-manifest.json"), noStore);
});

test("hashed webpack assets are immutable; unhashed public images use default headers", () => {
  const hashed = "public, max-age=31536000, immutable";
  assert.strictEqual(cacheControlForStaticFile("/build/static/js/main.abcd1234.js"), hashed);
  assert.strictEqual(cacheControlForStaticFile("/build/static/css/main.deadbeef.css"), hashed);
  assert.strictEqual(cacheControlForStaticFile("/build/logo192.png"), null);
  assert.strictEqual(cacheControlForStaticFile("/build/favicon.ico"), null);
});

test("gone/missing push endpoints are dropped; other errors are not", () => {
  assert.strictEqual(shouldDropSubscription(410), true);
  assert.strictEqual(shouldDropSubscription(404), true);
  assert.strictEqual(shouldDropSubscription(429), false);
  assert.strictEqual(shouldDropSubscription(500), false);
  assert.strictEqual(shouldDropSubscription(undefined), false);
});

test("push payload deep-links to a lead and truncates body", () => {
  const payload = buildPushPayload({
    user_id: "u1",
    id: "n1",
    title: "Missed follow-up",
    message: "Ravi Kumar  \nwas due an hour ago. ".repeat(20),
    target_id: "lead-99",
    target_type: "lead",
  });
  assert.strictEqual(payload.title, "Missed follow-up");
  assert.strictEqual(payload.url, "/leads/lead-99");
  assert.strictEqual(payload.tag, "n1");
  assert.ok(payload.body.length <= 140);
  assert.ok(!payload.body.includes("\n"));
});

test("non-lead notifications open the dashboard", () => {
  const payload = buildPushPayload({
    user_id: "u1",
    title: "3 Idle Leads Detected",
    message: "Check the delay report",
    target_type: "dashboard",
  });
  assert.strictEqual(payload.url, "/");
});

test("isWebPushConfigured requires both VAPID keys", () => {
  const prevPub = process.env.VAPID_PUBLIC_KEY;
  const prevPriv = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  assert.strictEqual(isWebPushConfigured(), false);
  process.env.VAPID_PUBLIC_KEY = "pub";
  assert.strictEqual(isWebPushConfigured(), false);
  process.env.VAPID_PRIVATE_KEY = "priv";
  assert.strictEqual(isWebPushConfigured(), true);
  if (prevPub === undefined) delete process.env.VAPID_PUBLIC_KEY;
  else process.env.VAPID_PUBLIC_KEY = prevPub;
  if (prevPriv === undefined) delete process.env.VAPID_PRIVATE_KEY;
  else process.env.VAPID_PRIVATE_KEY = prevPriv;
});

console.log("All web-push / static-cache tests passed");
