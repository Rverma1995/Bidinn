import cron from "node-cron";
import { v4 as uuidv4 } from "uuid";
import { AppDataSource } from "../config/data-source";
import { Activity } from "../entities";
import { previousCalendarMonth, priorDaysRange } from "../utils/lead-scope";
import { loadReportRecipients, warnIfNoReportRecipients } from "../utils/report-recipients";
import { emailService, MailSender } from "./email.service";
import { generateReportPdf, ReportPdfRenderer, ReportTemplateName } from "./pdf.service";
import { DelaySnapshot, fetchDelaySnapshot } from "./delay-leads.service";
import { getPeriodSummary, PeriodSummary } from "./dashboard-metrics.service";
import { getAgentPerformance, AgentPerformanceResult } from "./agent-performance.service";
import {
  daysIdle,
  daysOverdue,
  formatReportDate,
  formatReportDateTime,
  formatReportMonth,
  isoDateStamp,
  rankAgents,
  rollupAgentDelay,
} from "./report-metrics";
import { DelayReportView, SummaryReportView } from "./report-templates";

export const REPORT_TIMEZONE = "Asia/Kolkata";
export const DELAY_REPORT_CRON = "0 8 * * *";
export const WEEKLY_REPORT_CRON = "0 9 * * MON";
export const MONTHLY_REPORT_CRON = "0 9 1 * *";

const EMAIL_BODY = "Please find the attached report.";

export type ReportKind = "delay" | "weekly" | "monthly";

export interface ReportJobDeps {
  now?: Date;
  recipients?: string[];
  mailer?: MailSender;
  pdf?: ReportPdfRenderer;
  logActivity?: (action: string, details: string) => Promise<void>;
  fetchDelay?: (now: Date) => Promise<DelaySnapshot>;
  fetchPeriod?: (start: Date, end: Date) => Promise<PeriodSummary>;
  fetchAgents?: (start: Date, end: Date) => Promise<AgentPerformanceResult>;
}

async function defaultLogActivity(action: string, details: string): Promise<void> {
  try {
    const activityRepository = AppDataSource.getRepository(Activity);
    const activity = activityRepository.create({
      id: uuidv4(),
      user_id: null,
      user_name: "System",
      action,
      target_id: null as any,
      target_type: "report",
      target_name: action,
      details,
    });
    await activityRepository.save(activity);
  } catch (error) {
    console.error("Failed to log report activity:", error);
  }
}

function recipientList(deps: ReportJobDeps): string[] {
  return deps.recipients ?? loadReportRecipients();
}

function toDelayView(snapshot: DelaySnapshot): DelayReportView {
  const generatedAt = formatReportDateTime(snapshot.now);
  return {
    generatedAt,
    overdue: snapshot.overdue.map((lead) => ({
      name: lead.name,
      assigned_name: lead.assigned_name || "Unassigned",
      days: daysOverdue(lead, snapshot.now),
      last_activity: formatReportDateTime(lead.last_activity),
      kind: "overdue" as const,
    })),
    idle: snapshot.idle.map((lead) => ({
      name: lead.name,
      assigned_name: lead.assigned_name || "Unassigned",
      days: daysIdle(lead, snapshot.now),
      last_activity: formatReportDateTime(lead.last_activity || lead.created_at),
      kind: "idle" as const,
    })),
    agents: rollupAgentDelay(snapshot.overdue, snapshot.idle).map((row) => ({
      ...row,
      avg_response: snapshot.avgFirstCallMinutes.get(row.agent_id) ?? null,
    })),
  };
}

function toSummaryView(opts: {
  title: string;
  periodLabel: string;
  now: Date;
  period: PeriodSummary;
  snapshot: DelaySnapshot;
  agents: AgentPerformanceResult;
}): SummaryReportView {
  const ranked = rankAgents(
    opts.agents.agents.map((a) => ({
      agent_id: a.agent_id,
      agent_name: a.agent_name,
      converted: a.converted,
      total_revenue: a.total_revenue,
    }))
  );
  return {
    title: opts.title,
    periodLabel: opts.periodLabel,
    generatedAt: formatReportDateTime(opts.now),
    new_leads: opts.period.new_leads,
    new_leads_by_source: opts.period.new_leads_by_source,
    closed_won: opts.period.closed_won,
    closed_lost: opts.period.closed_lost,
    revenue: opts.period.revenue,
    conversion_rate: opts.period.conversion_rate,
    overdue_count: opts.snapshot.overdue.length,
    idle_count: opts.snapshot.idle.length,
    top_agents: ranked.top,
    bottom_agents: ranked.bottom,
  };
}

/**
 * Shared send path: empty recipients, PDF errors, and SMTP errors are logged
 * and return false — they must not throw into a sibling cron job.
 */
export async function deliverReportPdf(opts: {
  kind: ReportKind;
  subject: string;
  filename: string;
  templateName: ReportTemplateName;
  data: DelayReportView | SummaryReportView;
  deps?: ReportJobDeps;
}): Promise<boolean> {
  const recipients = recipientList(opts.deps || {});
  const log = opts.deps?.logActivity || defaultLogActivity;
  const action = `${opts.kind}_report_email`;
  const stamp = new Date().toISOString();

  if (recipients.length === 0) {
    const details = `${stamp} skipped ${opts.kind} report: REPORT_RECIPIENT_EMAILS is empty`;
    console.warn(details);
    await log(action, details);
    return false;
  }

  let pdfBuffer: Buffer;
  try {
    const renderer = opts.deps?.pdf || { generateReportPdf };
    pdfBuffer = await renderer.generateReportPdf(opts.templateName, opts.data);
  } catch (error) {
    const details = `${stamp} ${opts.kind} report PDF failed for ${recipients.join(", ")}: ${String(error)}`;
    console.error(details);
    await log(action, details);
    return false;
  }

  try {
    const mailer = opts.deps?.mailer || emailService;
    const sent = await mailer.sendEmail({
      to: recipients,
      subject: opts.subject,
      text: EMAIL_BODY,
      attachments: [{ filename: opts.filename, content: pdfBuffer, contentType: "application/pdf" }],
    });
    const details = sent
      ? `${stamp} sent ${opts.kind} report to ${recipients.join(", ")} (${opts.filename})`
      : `${stamp} failed to send ${opts.kind} report to ${recipients.join(", ")}`;
    if (sent) console.log(details);
    else console.error(details);
    await log(action, details);
    return sent;
  } catch (error) {
    const details = `${stamp} ${opts.kind} report SMTP threw for ${recipients.join(", ")}: ${String(error)}`;
    console.error(details);
    await log(action, details);
    return false;
  }
}

export async function sendDelayReport(deps: ReportJobDeps = {}): Promise<boolean> {
  const now = deps.now || new Date();
  try {
    const snapshot = await (deps.fetchDelay || fetchDelaySnapshot)(now);
    const view = toDelayView(snapshot);
    const day = isoDateStamp(now);
    return await deliverReportPdf({
      kind: "delay",
      subject: `Bidinn CRM — Delay Report (${formatReportDate(now)})`,
      filename: `delay-report-${day}.pdf`,
      templateName: "delay",
      data: view,
      deps,
    });
  } catch (error) {
    console.error("Delay report job error:", error);
    await (deps.logActivity || defaultLogActivity)(
      "delay_report_email",
      `${now.toISOString()} delay report query failed: ${String(error)}`
    );
    return false;
  }
}

export async function sendWeeklyReport(deps: ReportJobDeps = {}): Promise<boolean> {
  const now = deps.now || new Date();
  try {
    const { start, end } = priorDaysRange(now, 7);
    const [period, snapshot, agents] = await Promise.all([
      (deps.fetchPeriod || getPeriodSummary)(start, end),
      (deps.fetchDelay || fetchDelaySnapshot)(now),
      (deps.fetchAgents || ((s, e) => getAgentPerformance({ startDate: s, endDate: new Date(e.getTime() - 1) })))(start, end),
    ]);
    const view = toSummaryView({
      title: "Weekly Report",
      periodLabel: `${formatReportDate(start)} – ${formatReportDate(end)} (prior 7 days)`,
      now,
      period,
      snapshot,
      agents,
    });
    return await deliverReportPdf({
      kind: "weekly",
      subject: `Bidinn CRM — Weekly Report (${formatReportDate(start)} – ${formatReportDate(end)})`,
      filename: `weekly-report-${isoDateStamp(start)}-to-${isoDateStamp(end)}.pdf`,
      templateName: "weekly",
      data: view,
      deps,
    });
  } catch (error) {
    console.error("Weekly report job error:", error);
    await (deps.logActivity || defaultLogActivity)(
      "weekly_report_email",
      `${now.toISOString()} weekly report query failed: ${String(error)}`
    );
    return false;
  }
}

/**
 * Sent on the 1st covering the completed previous calendar month.
 * Metric definitions (won/lost via status + updated_at, revenue via paid/partial
 * booking.created_at) match GET /dashboard/stats monthly_* fields via getPeriodSummary.
 */
export async function sendMonthlyReport(deps: ReportJobDeps = {}): Promise<boolean> {
  const now = deps.now || new Date();
  try {
    const { start, end } = previousCalendarMonth(now);
    const [period, snapshot, agents] = await Promise.all([
      (deps.fetchPeriod || getPeriodSummary)(start, end),
      (deps.fetchDelay || fetchDelaySnapshot)(now),
      (deps.fetchAgents || ((s, e) => getAgentPerformance({ startDate: s, endDate: new Date(e.getTime() - 1) })))(start, end),
    ]);
    const monthLabel = formatReportMonth(start);
    const view = toSummaryView({
      title: "Monthly Report",
      periodLabel: `${monthLabel} (${formatReportDate(start)} – ${formatReportDate(end)})`,
      now,
      period,
      snapshot,
      agents,
    });
    return await deliverReportPdf({
      kind: "monthly",
      subject: `Bidinn CRM — Monthly Report (${monthLabel})`,
      filename: `monthly-report-${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}.pdf`,
      templateName: "monthly",
      data: view,
      deps,
    });
  } catch (error) {
    console.error("Monthly report job error:", error);
    await (deps.logActivity || defaultLogActivity)(
      "monthly_report_email",
      `${now.toISOString()} monthly report query failed: ${String(error)}`
    );
    return false;
  }
}

async function runSafely(name: string, fn: () => Promise<boolean>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error(`${name} failed (isolated):`, error);
  }
}

export function scheduleEmailReportJobs(): void {
  const recipients = loadReportRecipients();
  warnIfNoReportRecipients(recipients);

  const opts = { timezone: REPORT_TIMEZONE, noOverlap: true as const };

  cron.schedule(DELAY_REPORT_CRON, () => runSafely("delay_report", () => sendDelayReport()), {
    ...opts,
    name: "delay-report",
  });
  cron.schedule(WEEKLY_REPORT_CRON, () => runSafely("weekly_report", () => sendWeeklyReport()), {
    ...opts,
    name: "weekly-report",
  });
  cron.schedule(MONTHLY_REPORT_CRON, () => runSafely("monthly_report", () => sendMonthlyReport()), {
    ...opts,
    name: "monthly-report",
  });

  console.log(
    `Email report jobs scheduled (${REPORT_TIMEZONE}): delay daily 08:00, weekly Monday 09:00, monthly 1st 09:00`
  );
}
