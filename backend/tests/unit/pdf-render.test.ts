import assert from "assert";
import fs from "fs";
import path from "path";
import { generateReportPdf } from "../../src/services/pdf.service";
import { DelayReportView, SummaryReportView } from "../../src/services/report-templates";

function test(name: string, fn: () => Promise<void>) {
  return fn().then(() => console.log(`PASS: ${name}`));
}

const outDir = path.resolve(__dirname, "../output");

function isPdf(buf: Buffer): boolean {
  return buf.slice(0, 4).toString() === "%PDF";
}

const delayView: DelayReportView = {
  generatedAt: "29 Aug 2026, 10:00 am",
  overdue: [
    { name: "Ravi Kumar", assigned_name: "Emily Davis", days: 9, last_activity: "20 Aug 2026, 12:00 pm", kind: "overdue" },
    { name: "Amit Patel", assigned_name: "James Miller", days: 2, last_activity: "27 Aug 2026, 09:15 am", kind: "overdue" },
  ],
  idle: [
    { name: "Priya Sharma", assigned_name: "Emily Davis", days: 12, last_activity: "17 Aug 2026, 04:00 pm", kind: "idle" },
    { name: "Unassigned Lead", assigned_name: "Unassigned", days: 20, last_activity: "9 Aug 2026, 11:00 am", kind: "idle" },
  ],
  agents: [
    { agent_id: "u1", agent_name: "Emily Davis", overdue_count: 1, idle_count: 1, avg_response: 45 },
    { agent_id: "u2", agent_name: "James Miller", overdue_count: 1, idle_count: 0, avg_response: 180 },
    { agent_id: "unassigned", agent_name: "Unassigned", overdue_count: 0, idle_count: 1, avg_response: null },
  ],
};

const weeklyView: SummaryReportView = {
  title: "Weekly Report",
  periodLabel: "22 Aug 2026 – 29 Aug 2026 (prior 7 days)",
  generatedAt: "29 Aug 2026, 09:00 am",
  new_leads: 42,
  new_leads_by_source: [
    { source: "Website", count: 18 },
    { source: "Meta Lead Ads", count: 14 },
    { source: "Referral", count: 10 },
  ],
  closed_won: 6,
  closed_lost: 4,
  revenue: 385000,
  conversion_rate: 60,
  overdue_count: 2,
  idle_count: 2,
  top_agents: [
    { agent_name: "Emily Davis", converted: 3, total_revenue: 210000 },
    { agent_name: "James Miller", converted: 2, total_revenue: 125000 },
  ],
  bottom_agents: [
    { agent_name: "Olivia Brown", converted: 0, total_revenue: 0 },
    { agent_name: "James Miller", converted: 2, total_revenue: 125000 },
  ],
};

const monthlyView: SummaryReportView = {
  ...weeklyView,
  title: "Monthly Report",
  periodLabel: "July 2026 (1 Jul 2026 – 1 Aug 2026)",
  generatedAt: "1 Aug 2026, 09:00 am",
  new_leads: 180,
  closed_won: 22,
  closed_lost: 18,
  revenue: 1425000,
  conversion_rate: 55,
};

async function run() {
  fs.mkdirSync(outDir, { recursive: true });

  await test("delay PDF renders and starts with %PDF", async () => {
    const buf = await generateReportPdf("delay", delayView);
    assert.ok(isPdf(buf), "not a PDF");
    assert.ok(buf.length > 1000, `PDF too small: ${buf.length}`);
    const dest = path.join(outDir, "delay-report-sample.pdf");
    fs.writeFileSync(dest, buf);
    console.log(`  wrote ${dest} (${buf.length} bytes)`);
  });

  await test("weekly PDF renders", async () => {
    const buf = await generateReportPdf("weekly", weeklyView);
    assert.ok(isPdf(buf), "not a PDF");
    const dest = path.join(outDir, "weekly-report-sample.pdf");
    fs.writeFileSync(dest, buf);
    console.log(`  wrote ${dest} (${buf.length} bytes)`);
  });

  await test("monthly PDF renders", async () => {
    const buf = await generateReportPdf("monthly", monthlyView);
    assert.ok(isPdf(buf), "not a PDF");
    const dest = path.join(outDir, "monthly-report-sample.pdf");
    fs.writeFileSync(dest, buf);
    console.log(`  wrote ${dest} (${buf.length} bytes)`);
  });

  console.log("All PDF render tests passed — open backend/tests/output/*.pdf to inspect layout");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
