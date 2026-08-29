import nodemailer, { Transporter } from "nodemailer";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
}

export interface MailSender {
  sendEmail(options: SendEmailOptions): Promise<boolean>;
}

function buildTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    console.warn("SMTP_HOST is not set; email reports will be skipped until SMTP is configured");
    return null;
  }

  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass: pass || "" } : undefined,
  });
}

/**
 * Fail-soft mailer: SMTP errors are logged and return false.
 * A failed send must not take down a cron process that also does other work.
 */
export class EmailService implements MailSender {
  constructor(private transporter: Transporter | null = buildTransporter()) {}

  async sendEmail({ to, subject, text, attachments }: SendEmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.warn(`Email skipped (SMTP not configured): ${subject}`);
      return false;
    }

    const recipients = Array.isArray(to) ? to : [to];
    if (recipients.length === 0) {
      console.warn(`Email skipped (no recipients): ${subject}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER || "noreply@bidinn.com",
        to: recipients.join(", "),
        subject,
        text,
        attachments: (attachments || []).map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType || "application/pdf",
        })),
      });
      return true;
    } catch (error) {
      console.error("Email send failed:", error);
      return false;
    }
  }
}

export const emailService = new EmailService();
