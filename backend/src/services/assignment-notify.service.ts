import { v4 as uuidv4 } from "uuid";
import { AppDataSource } from "../config/data-source";
import { Notification, NotificationPriority, NotificationType, User } from "../entities";
import { emailService } from "./email.service";
import { sendPushForNotifications } from "./web-push.service";

export interface AssignmentNotifyOpts {
  assignee: Pick<User, "id" | "email" | "name" | "is_active"> | User | null | undefined;
  assignerId: string;
  assignerName: string;
  count: number;
  leadId?: string;
  leadName?: string;
}

/**
 * Skip self-assignment, inactive users, missing assignee, and empty batches.
 * Assignment itself must still succeed — callers ignore a false result.
 */
export function shouldNotifyAssignee(opts: AssignmentNotifyOpts): boolean {
  if (!opts.assignee?.id) return false;
  if (opts.assignee.id === opts.assignerId) return false;
  if (opts.assignee.is_active === false) return false;
  if (!opts.count || opts.count < 1) return false;
  return true;
}

export function buildAssignmentNotice(opts: AssignmentNotifyOpts): {
  title: string;
  message: string;
  target_type: "lead" | "dashboard";
} {
  const title =
    opts.count === 1 ? "New lead assigned to you" : `${opts.count} leads assigned to you`;
  const message =
    opts.count === 1
      ? `${opts.leadName || "A lead"} was assigned to you by ${opts.assignerName}. Check your dashboard.`
      : `${opts.count} leads were assigned to you by ${opts.assignerName}. Check your dashboard.`;
  return {
    title,
    message,
    target_type: opts.leadId ? "lead" : "dashboard",
  };
}

/**
 * In-app + email alert for the assigned agent only.
 * Fail-soft: assignment must succeed even if notify/email fails.
 */
export async function notifyAssigneeOfLeads(opts: AssignmentNotifyOpts & { assignee: User }): Promise<void> {
  if (!shouldNotifyAssignee(opts)) return;

  const { title, message, target_type } = buildAssignmentNotice(opts);

  try {
    const notificationRepository = AppDataSource.getRepository(Notification);
    const notification = notificationRepository.create({
      id: uuidv4(),
      user_id: opts.assignee.id,
      type: NotificationType.LEAD_ASSIGNMENT,
      priority: NotificationPriority.HIGH,
      title,
      message,
      target_id: opts.leadId,
      target_type,
      metadata: {
        count: opts.count,
        assigned_by: opts.assignerName,
        lead_name: opts.leadName,
      },
    });
    await notificationRepository.save(notification);
  } catch (error) {
    console.error("Failed to create assignment notification:", error);
  }

  void sendPushForNotifications([
    {
      user_id: opts.assignee.id,
      title,
      message,
      target_id: opts.leadId,
      target_type,
    },
  ]);

  if (!opts.assignee.email) return;

  try {
    await emailService.sendEmail({
      to: opts.assignee.email,
      subject: title,
      text: [
        `Hi ${opts.assignee.name},`,
        "",
        message,
        "",
        "Log in to Bidinn CRM and open your dashboard to see the assigned leads.",
      ].join("\n"),
    });
  } catch (error) {
    console.error("Failed to send assignment email:", error);
  }
}
