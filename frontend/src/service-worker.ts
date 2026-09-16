/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

// CRA + Workbox InjectManifest entry. react-scripts compiles this file in
// production when it exists at src/service-worker.ts.
// See https://cra.link/PWA

import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { NetworkFirst, NetworkOnly, StaleWhileRevalidate } from "workbox-strategies";
import { filterPrecacheManifest, isApiPath, shouldHandleNavigation } from "./pwa/cache-policy";

declare const self: ServiceWorkerGlobalScope;

clientsClaim();
cleanupOutdatedCaches();

// Precache hashed JS/CSS/media. index.html is filtered out so a new deploy is
// not served from a cache-first copy of the old HTML (stale-app-shell bug).
precacheAndRoute(filterPrecacheManifest(self.__WB_MANIFEST));

registerRoute(({ url }) => isApiPath(url.pathname), new NetworkOnly());

registerRoute(
  ({ request, url }) => shouldHandleNavigation(request.mode, url.pathname),
  new NetworkFirst({
    cacheName: "app-shell",
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
);

registerRoute(
  ({ url }) =>
    url.origin === self.location.origin && /\.(png|jpg|jpeg|svg|ico|webp)$/i.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: "images",
    plugins: [new ExpirationPlugin({ maxEntries: 50 })],
  })
);

registerRoute(
  ({ url }) =>
    url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com",
  new StaleWhileRevalidate({
    cacheName: "google-fonts",
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
);

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event: PushEvent) => {
  let title = "Bidinn CRM";
  let body = "You have a new notification";
  let url = "/";
  let tag = "bidinn-crm";

  try {
    if (event.data) {
      const payload = event.data.json() as {
        title?: string;
        body?: string;
        url?: string;
        tag?: string;
      };
      if (payload.title) title = payload.title;
      if (payload.body) body = payload.body;
      if (payload.url) url = payload.url;
      if (payload.tag) tag = payload.tag;
    }
  } catch {
    try {
      const text = event.data?.text();
      if (text) body = text;
    } catch {
      // keep defaults
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/logo192.png",
      badge: "/logo192.png",
      tag,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          const windowClient = client as WindowClient;
          if (windowClient.url.startsWith(self.location.origin) && "navigate" in windowClient) {
            return windowClient.navigate(targetUrl).then((navigated) => (navigated || windowClient).focus());
          }
          return windowClient.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
