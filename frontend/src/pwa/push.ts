const PUSH_PREF_KEY = "bidinn_push_enabled";

type ApiClient = {
  get: (url: string) => Promise<{ data: any }>;
  post: (url: string, body: unknown) => Promise<unknown>;
  delete: (url: string, config?: { data?: unknown }) => Promise<unknown>;
};

export function isPushPrefEnabled(): boolean {
  try {
    return localStorage.getItem(PUSH_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPushPrefEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(PUSH_PREF_KEY, "1");
    else localStorage.removeItem(PUSH_PREF_KEY);
  } catch {
    // ignore quota / private mode
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export async function subscribeToPush(api: ApiClient): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;
  const { data } = await api.get("/push/vapid-public-key");
  if (!data?.enabled || !data?.publicKey) {
    throw new Error("Web Push is not configured on the server");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await api.post("/push/subscribe", existing.toJSON());
    setPushPrefEnabled(true);
    return existing;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey) as any,
  });

  await api.post("/push/subscribe", subscription.toJSON());
  setPushPrefEnabled(true);
  return subscription;
}

export async function unsubscribeFromPush(api: ApiClient): Promise<void> {
  setPushPrefEnabled(false);
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    try {
      await api.delete("/push/subscribe", { data: { endpoint: subscription.endpoint } });
    } catch {
      // Still drop the local subscription so this device stops receiving
    }
    await subscription.unsubscribe();
  } catch {
    // ignore
  }
}

/** Re-subscribe after login when the user previously enabled push on this device. */
export async function syncPushSubscriptionIfPreferred(api: ApiClient): Promise<void> {
  if (!isPushPrefEnabled()) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    await subscribeToPush(api);
  } catch {
    // leave pref set; Settings can surface the error if they toggle again
  }
}
