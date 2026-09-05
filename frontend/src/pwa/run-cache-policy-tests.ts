import assert from "assert";
import {
  filterPrecacheManifest,
  isApiPath,
  isPrecacheExcluded,
  isStaleAppShell,
  shouldHandleNavigation,
} from "./cache-policy";

function test(name: string, fn: () => void) {
  fn();
  console.log(`PASS: ${name}`);
}

test("API paths are never treated as cacheable navigations", () => {
  assert.strictEqual(isApiPath("/api"), true);
  assert.strictEqual(isApiPath("/api/leads"), true);
  assert.strictEqual(isApiPath("/api/notifications"), true);
  assert.strictEqual(isApiPath("/leads"), false);
  assert.strictEqual(shouldHandleNavigation("navigate", "/api/leads"), false);
  assert.strictEqual(shouldHandleNavigation("navigate", "/leads"), true);
});

test("SPA routes are app-shell navigations; static files are not", () => {
  assert.strictEqual(shouldHandleNavigation("navigate", "/"), true);
  assert.strictEqual(shouldHandleNavigation("navigate", "/pipeline"), true);
  assert.strictEqual(shouldHandleNavigation("navigate", "/leads/abc"), true);
  assert.strictEqual(shouldHandleNavigation("GET", "/"), false);
  assert.strictEqual(shouldHandleNavigation("navigate", "/static/js/main.js"), false);
  assert.strictEqual(shouldHandleNavigation("navigate", "/logo192.png"), false);
  assert.strictEqual(shouldHandleNavigation("navigate", "/_internal"), false);
});

test("index.html and the service worker are excluded from the precache (prevents stale deploys)", () => {
  assert.strictEqual(isPrecacheExcluded("/index.html"), true);
  assert.strictEqual(isPrecacheExcluded("index.html"), true);
  assert.strictEqual(isPrecacheExcluded("/service-worker.js"), true);
  assert.strictEqual(isPrecacheExcluded("/asset-manifest.json"), true);
  assert.strictEqual(isPrecacheExcluded("/static/js/main.abcd1234.js"), false);
  assert.strictEqual(isPrecacheExcluded("/static/css/main.deadbeef.css"), false);

  const nextBuild = filterPrecacheManifest([
    { url: "/index.html", revision: "rev-old" },
    { url: "/service-worker.js", revision: null },
    { url: "/asset-manifest.json", revision: "manifest-old" },
    { url: "/static/js/main.aaa11111.js", revision: null },
    { url: "/static/css/main.bbb22222.css", revision: null },
    { url: "/logo192.png", revision: "icon-1" },
  ]);

  assert.deepStrictEqual(
    nextBuild.map((e) => e.url),
    ["/static/js/main.aaa11111.js", "/static/css/main.bbb22222.css", "/logo192.png"]
  );
});

test("a new deploy with new hashed bundles + new HTML revision is detected as stale if HTML were cache-first", () => {
  const oldHtml = "html-rev-1";
  const newHtml = "html-rev-2";
  assert.strictEqual(isStaleAppShell(oldHtml, newHtml), true);
  assert.strictEqual(isStaleAppShell(newHtml, newHtml), false);

  const oldManifest = filterPrecacheManifest([
    { url: "/index.html", revision: oldHtml },
    { url: "/static/js/main.aaa11111.js", revision: null },
  ]);
  const newManifest = filterPrecacheManifest([
    { url: "/index.html", revision: newHtml },
    { url: "/static/js/main.fff99999.js", revision: null },
  ]);

  assert.ok(!oldManifest.some((e) => e.url.endsWith("index.html")));
  assert.ok(!newManifest.some((e) => e.url.endsWith("index.html")));
  assert.ok(oldManifest.some((e) => e.url.includes("main.aaa11111.js")));
  assert.ok(newManifest.some((e) => e.url.includes("main.fff99999.js")));
  assert.ok(!newManifest.some((e) => e.url.includes("main.aaa11111.js")));
});

console.log("All PWA cache-policy tests passed");
