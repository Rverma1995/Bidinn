import path from "path";

/**
 * HTTP cache headers for files Express serves from frontend/build.
 * Hashed webpack files are immutable; index.html and the service worker must
 * never be stored by the browser or users stay on an old deploy.
 */
export function cacheControlForStaticFile(filePath: string): string | null {
  const base = path.basename(filePath);
  if (
    base === "service-worker.js" ||
    base === "index.html" ||
    base === "manifest.json" ||
    base === "asset-manifest.json"
  ) {
    return "no-cache, no-store, must-revalidate";
  }
  if (/\.[0-9a-f]{8}\./.test(base)) {
    return "public, max-age=31536000, immutable";
  }
  return null;
}
