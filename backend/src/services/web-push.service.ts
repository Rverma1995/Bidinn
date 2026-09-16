import webpush from "web-push";
import { AppDataSource } from "../config/data-source";
import { PushSubscription } from "../entities/PushSubscription";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface NotificationPushInput {
  user_id: string;
  title: string;
  message: string;
  target_id?: string | null;
  target_type?: string | null;
  id?: string;
}

export function isWebPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function shouldDropSubscription(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (!isWebPushConfigured()) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:noreply@bidinn.in",
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );
    vapidConfigured = true;
  }
  return true;
}

export function buildPushPayload(notification: NotificationPushInput): PushPayload {
  const body = (notification.message || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  const url =
    notification.target_type === "lead" && notification.target_id
      ? `/leads/${notification.target_id}`
      : "/";
  return {
    title: notification.title || "Bidinn CRM",
    body: body || "You have a new notification",
    url,
    tag: notification.id,
  };
}

async function sendToSubscription(sub: PushSubscription, payload: PushPayload): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload)
    );
  } catch (error: any) {
    const status = error?.statusCode || error?.status;
    if (shouldDropSubscription(status)) {
      try {
        await AppDataSource.getRepository(PushSubscription).delete({ id: sub.id });
      } catch {
        // ignore cleanup failure
      }
      return;
    }
    console.error("Web push failed:", error?.message || error);
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureVapid() || !userId) return;
  if (!AppDataSource.isInitialized) return;

  const repo = AppDataSource.getRepository(PushSubscription);
  const subs = await repo.find({ where: { user_id: userId } });
  if (subs.length === 0) return;
  await Promise.allSettled(subs.map((sub) => sendToSubscription(sub, payload)));
}

/** Fail-soft: never throw into the caller (assignment / jobs must still succeed). */
export async function sendPushForNotifications(notifications: NotificationPushInput[]): Promise<void> {
  if (!ensureVapid() || !notifications?.length) return;
  try {
    await Promise.allSettled(
      notifications.map((notification) => sendPushToUser(notification.user_id, buildPushPayload(notification)))
    );
  } catch (error) {
    console.error("Web push dispatch error:", error);
  }
}
