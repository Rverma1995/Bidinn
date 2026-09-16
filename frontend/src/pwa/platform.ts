/** iOS / install / push capability checks. Keep promises out of this file so Settings can branch on facts. */

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const classic = /iPad|iPhone|iPod/.test(ua);
  const ipadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return classic || ipadOs;
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    nav.standalone === true
  );
}

export function webPushApiAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * iOS Safari only delivers Web Push for Home Screen PWAs (iOS 16.4+).
 * In a regular Safari tab, PushManager may be missing even when the API exists on Android Chrome.
 */
export function canSubscribeToWebPush(): boolean {
  if (!webPushApiAvailable()) return false;
  if (isIosDevice() && !isStandaloneDisplay()) return false;
  return true;
}
