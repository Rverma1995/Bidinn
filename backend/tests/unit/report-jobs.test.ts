import assert from "assert";
import cron from "node-cron";
import {
  DELAY_REPORT_CRON,
  WEEKLY_REPORT_CRON,
  MONTHLY_REPORT_CRON,
  deliverReportPdf,
  sendDelayReport,
  sendWeeklyReport,
  sendMonthlyReport,
  ReportJobDeps,
} from "../../src/services/report-jobs.service";
import { DelaySnapshot } from "../../src/services/delay-leads.service";
import { PeriodSummary } from "../../src/services/dashboard-metrics.service";
import { AgentPerformanceResult } from "../../src/services/agent-performance.service";
import { LeadStatus } from "../../src/entities";
import { previousCalendarMonth } from "../../src/utils/lead-scope";

function test(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`PASS: ${name}`));
}

function emptySnapshot(now: Date): DelaySnapshot {
  return { now, overdue: [], idle: [], avgFirstCallMinutes: new Map() };
}

function emptyPeriod(start: Date, end: Date): PeriodSummary {
  return {
    start,
    end,
    new_leads: 3,
    closed_won: 1,
    closed_lost: 1,
    revenue: 12500,
    conversion_rate: 50,
    new_leads_by_source: [{ source: "Website", count: 3 }],
  };
}

function emptyAgents(): AgentPerformanceResult {
  return {
    agents: [
      {
        agent_id: "u1",
        agent_name: "Emily",
        agent_email: "emily@bidinn.com",
        agent_role: "sales_rep",
        total_leads: 4,
        contacted: 3,
        not_contacted: 1,
        converted: 2,
        conversion_rate: 50,
        calls_made: 5,
        total_revenue: 8000,
      },
    ],
    team_summary: { total_leads: 4, contacted: 3, not_contacted: 1, converted: 2, total_revenue: 8000 },
    all_agents: [],
  };
}

async function run() {
  await test("cron expressions are valid", () => {
    assert.strictEqual(cron.validate(DELAY_REPORT_CRON), true);
    assert.strictEqual(cron.validate(WEEKLY_REPORT_CRON), true);
    assert.strictEqual(cron.validate(MONTHLY_REPORT_CRON), true);
  });

  await test("empty recipients skips send and does not call PDF or SMTP", async () => {
    let pdfCalls = 0;
    let mailCalls = 0;
    const logs: string[] = [];
    const sent = await deliverReportPdf({
      kind: "delay",
      subject: "x",
      filename: "x.pdf",
      templateName: "delay",
      data: { generatedAt: "", overdue: [], idle: [], agents: [] },
      deps: {
        recipients: [],
        pdf: {
          generateReportPdf: async () => {
            pdfCalls += 1;
            return Buffer.from("%PDF");
          },
        },
        mailer: {
          sendEmail: async () => {
            mailCalls += 1;
            return true;
          },
        },
        logActivity: async (_action, details) => {
          logs.push(details);
        },
      },
    });
    assert.strictEqual(sent, false);
    assert.strictEqual(pdfCalls, 0);
    assert.strictEqual(mailCalls, 0);
    assert.ok(logs[0].includes("REPORT_RECIPIENT_EMAILS"));
  });

  await test("PDF failure does not throw and does not send mail", async () => {
    let mailCalls = 0;
    const logs: string[] = [];
    const sent = await deliverReportPdf({
      kind: "weekly",
      subject: "x",
      filename: "x.pdf",
      templateName: "weekly",
      data: {
        title: "Weekly",
        periodLabel: "",
        generatedAt: "",
        new_leads: 0,
        new_leads_by_source: [],
        closed_won: 0,
        closed_lost: 0,
        revenue: 0,
        conversion_rate: 0,
        overdue_count: 0,
        idle_count: 0,
        top_agents: [],
        bottom_agents: [],
      },
      deps: {
        recipients: ["ops@bidinn.com"],
        pdf: {
          generateReportPdf: async () => {
            throw new Error("chromium crashed");
          },
        },
        mailer: {
          sendEmail: async () => {
            mailCalls += 1;
            return true;
          },
        },
        logActivity: async (_a, d) => {
          logs.push(d);
        },
      },
    });
    assert.strictEqual(sent, false);
    assert.strictEqual(mailCalls, 0);
    assert.ok(logs[0].includes("PDF failed"));
  });

  await test("SMTP throw is isolated and returns false", async () => {
    const logs: string[] = [];
    const sent = await deliverReportPdf({
      kind: "monthly",
      subject: "x",
      filename: "x.pdf",
      templateName: "monthly",
      data: {
        title: "Monthly",
        periodLabel: "",
        generatedAt: "",
        new_leads: 0,
        new_leads_by_source: [],
        closed_won: 0,
        closed_lost: 0,
        revenue: 0,
        conversion_rate: 0,
        overdue_count: 0,
        idle_count: 0,
        top_agents: [],
        bottom_agents: [],
      },
      deps: {
        recipients: ["ops@bidinn.com"],
        pdf: { generateReportPdf: async () => Buffer.from("%PDF-1.4") },
        mailer: {
          sendEmail: async () => {
            throw new Error("SMTP 550");
          },
        },
        logActivity: async (_a, d) => {
          logs.push(d);
        },
      },
    });
    assert.strictEqual(sent, false);
    assert.ok(logs[0].includes("SMTP threw"));
  });

  await test("SMTP false (fail-soft) is logged as failure", async () => {
    const logs: string[] = [];
    const sent = await deliverReportPdf({
      kind: "delay",
      subject: "x",
      filename: "x.pdf",
      templateName: "delay",
      data: { generatedAt: "", overdue: [], idle: [], agents: [] },
      deps: {
        recipients: ["ops@bidinn.com"],
        pdf: { generateReportPdf: async () => Buffer.from("%PDF-1.4") },
        mailer: { sendEmail: async () => false },
        logActivity: async (_a, d) => {
          logs.push(d);
        },
      },
    });
    assert.strictEqual(sent, false);
    assert.ok(logs[0].includes("failed to send"));
  });

  const fixtureNow = new Date("2026-08-29T10:00:00");
  const snapshot: DelaySnapshot = {
    now: fixtureNow,
    overdue: [
      {
        name: "Ravi Kumar",
        assigned_to: "u1",
        assigned_name: "Emily Davis",
        status: LeadStatus.FOLLOWUP,
        next_followup: "2026-08-20T09:00:00",
        last_activity: "2026-08-19T12:00:00",
        created_at: "2026-08-01T10:00:00",
      },
    ],
    idle: [
      {
        name: "Priya Sharma",
        assigned_to: "u1",
        assigned_name: "Emily Davis",
        status: LeadStatus.INTERESTED,
        last_activity: "2026-08-10T10:00:00",
        created_at: "2026-08-01T10:00:00",
      },
    ],
    avgFirstCallMinutes: new Map([["u1", 45]]),
  };

  await test("delay report feeds overdue/idle counts from fixture data into the PDF payload", async () => {
    let captured: any;
    const sent = await sendDelayReport({
      now: fixtureNow,
      recipients: ["ops@bidinn.com"],
      fetchDelay: async () => snapshot,
      pdf: {
        generateReportPdf: async (template, data) => {
          captured = { template, data };
          return Buffer.from("%PDF-1.4");
        },
      },
      mailer: { sendEmail: async () => true },
      logActivity: async () => {},
    });
    assert.strictEqual(sent, true);
    assert.strictEqual(captured.template, "delay");
    assert.strictEqual(captured.data.overdue.length, 1);
    assert.strictEqual(captured.data.overdue[0].name, "Ravi Kumar");
    assert.strictEqual(captured.data.idle.length, 1);
    assert.strictEqual(captured.data.agents[0].overdue_count, 1);
    assert.strictEqual(captured.data.agents[0].idle_count, 1);
    assert.strictEqual(captured.data.agents[0].avg_response, 45);
  });

  await test("weekly report period metrics from fixture reach the PDF payload", async () => {
    let captured: any;
    let periodRange: { start: Date; end: Date } | null = null;
    const sent = await sendWeeklyReport({
      now: fixtureNow,
      recipients: ["ops@bidinn.com"],
      fetchDelay: async () => snapshot,
      fetchPeriod: async (start, end) => {
        periodRange = { start, end };
        return emptyPeriod(start, end);
      },
      fetchAgents: async () => emptyAgents(),
      pdf: {
        generateReportPdf: async (template, data) => {
          captured = { template, data };
          return Buffer.from("%PDF-1.4");
        },
      },
      mailer: { sendEmail: async () => true },
      logActivity: async () => {},
    });
    assert.strictEqual(sent, true);
    assert.strictEqual(captured.template, "weekly");
    assert.strictEqual(captured.data.new_leads, 3);
    assert.strictEqual(captured.data.closed_won, 1);
    assert.strictEqual(captured.data.revenue, 12500);
    assert.strictEqual(captured.data.overdue_count, 1);
    assert.strictEqual(captured.data.idle_count, 1);
    assert.strictEqual(captured.data.top_agents[0].agent_name, "Emily");
    assert.ok(periodRange);
    assert.strictEqual(periodRange!.end.getTime(), fixtureNow.getTime());
    assert.strictEqual(periodRange!.start.getTime(), fixtureNow.getTime() - 7 * 24 * 60 * 60 * 1000);
  });

  await test("monthly report on 1 Aug uses July window and fixture totals", async () => {
    const sendAt = new Date("2026-08-01T09:00:00");
    const expected = previousCalendarMonth(sendAt);
    let periodRange: { start: Date; end: Date } | null = null;
    let captured: any;
    const sent = await sendMonthlyReport({
      now: sendAt,
      recipients: ["ops@bidinn.com"],
      fetchDelay: async () => emptySnapshot(sendAt),
      fetchPeriod: async (start, end) => {
        periodRange = { start, end };
        return emptyPeriod(start, end);
      },
      fetchAgents: async () => emptyAgents(),
      pdf: {
        generateReportPdf: async (template, data) => {
          captured = { template, data };
          return Buffer.from("%PDF-1.4");
        },
      },
      mailer: { sendEmail: async () => true },
      logActivity: async () => {},
    });
    assert.strictEqual(sent, true);
    assert.strictEqual(captured.template, "monthly");
    assert.strictEqual(periodRange!.start.getTime(), expected.start.getTime());
    assert.strictEqual(periodRange!.end.getTime(), expected.end.getTime());
    assert.strictEqual(periodRange!.start.getMonth(), 6);
    assert.strictEqual(periodRange!.end.getMonth(), 7);
    assert.strictEqual(captured.data.closed_won, 1);
    assert.strictEqual(captured.data.revenue, 12500);
  });

  await test("one report's PDF failure does not prevent a sibling job in the same process", async () => {
    const results: boolean[] = [];
    const depsFail: ReportJobDeps = {
      now: fixtureNow,
      recipients: ["ops@bidinn.com"],
      fetchDelay: async () => snapshot,
      pdf: {
        generateReportPdf: async () => {
          throw new Error("pdf down");
        },
      },
      mailer: { sendEmail: async () => true },
      logActivity: async () => {},
    };
    const depsOk: ReportJobDeps = {
      now: fixtureNow,
      recipients: ["ops@bidinn.com"],
      fetchDelay: async () => snapshot,
      fetchPeriod: async (s, e) => emptyPeriod(s, e),
      fetchAgents: async () => emptyAgents(),
      pdf: { generateReportPdf: async () => Buffer.from("%PDF-1.4") },
      mailer: { sendEmail: async () => true },
      logActivity: async () => {},
    };
    results.push(await sendDelayReport(depsFail));
    results.push(await sendWeeklyReport(depsOk));
    assert.deepStrictEqual(results, [false, true]);
  });

  console.log("All report-jobs tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
