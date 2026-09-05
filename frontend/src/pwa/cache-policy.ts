/**
 * Service-worker routing rules used by src/service-worker.ts.
 * Kept free of Workbox so cache-busting behaviour can be unit-tested.
 *
 * Cache-busting strategy (the usual "stuck on an old deploy" bug):
 * - Hashed webpack assets (main.abcd1234.js) are immutable → precache cache-first is safe.
 * - index.html is NEVER precached. Navigations use NetworkFirst so a new deploy's
 *   HTML (which points at new hashed JS) wins while the tab is online.
 * - /api/* is never cached (leads/bookings must stay live).
 * - service-worker.js itself is not precached; the browser revalidates it.
 */

export type PrecacheEntry = { url: string; revision?: string | null };

const FILE_EXTENSION_RE = /\/[^/?]+\.[^/]+$/;

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isPrecacheExcluded(url: string): boolean {
  const path = url.split("?")[0];
  return (
    path.endsWith("index.html") ||
    path.endsWith("asset-manifest.json") ||
    path.endsWith("service-worker.js")
  );
}

export function filterPrecacheManifest(manifest: (string | PrecacheEntry)[]): PrecacheEntry[] {
  return manifest
    .map((entry) => (typeof entry === "string" ? { url: entry } : entry))
    .filter((entry) => !isPrecacheExcluded(entry.url));
}

export function shouldHandleNavigation(requestMode: string, pathname: string): boolean {
  if (requestMode !== "navigate") return false;
  if (pathname.startsWith("/_")) return false;
  if (isApiPath(pathname)) return false;
  if (FILE_EXTENSION_RE.test(pathname)) return false;
  return true;
}

/** True when a new build's HTML revision differs from what a cache-first SW would serve. */
export function isStaleAppShell(
  cachedHtmlRevision: string | null | undefined,
  liveHtmlRevision: string | null | undefined
): boolean {
  if (!liveHtmlRevision) return false;
  return cachedHtmlRevision !== liveHtmlRevision;
}
