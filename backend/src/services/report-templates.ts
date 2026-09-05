import { formatInr, formatMinutesAsDuration, AgentDelayRow } from "./report-metrics";

const TABLE_CAP = 100;

export interface DelayLeadRow {
  name: string;
  assigned_name: string;
  days: number;
  last_activity: string;
  kind: "overdue" | "idle";
}

export interface DelayReportView {
  generatedAt: string;
  overdue: DelayLeadRow[];
  idle: DelayLeadRow[];
  agents: Array<AgentDelayRow & { avg_response?: number | null }>;
}

export interface SummaryReportView {
  title: string;
  periodLabel: string;
  generatedAt: string;
  new_leads: number;
  new_leads_by_source: { source: string; count: number }[];
  closed_won: number;
  closed_lost: number;
  revenue: number;
  conversion_rate: number;
  overdue_count: number;
  idle_count: number;
  top_agents: { agent_name: string; converted: number; total_revenue: number }[];
  bottom_agents: { agent_name: string; converted: number; total_revenue: number }[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Print-oriented wrapper: A4, repeating table headers, avoid mid-row page breaks. */
function wrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 14mm 12mm 18mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #18181b;
      font-size: 12px;
      line-height: 1.45;
    }
    h1 { font-size: 20px; margin: 0 0 4px; font-weight: 600; }
    h2 { font-size: 14px; margin: 18px 0 8px; page-break-after: avoid; }
    .brand { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #0f766e; }
    .header { border-bottom: 3px solid #0f766e; padding-bottom: 12px; margin-bottom: 16px; }
    .meta { color: #52525b; font-size: 11px; margin: 0 0 8px; }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0 0 12px; }
    table.data thead { display: table-header-group; }
    table.data th {
      text-align: left;
      padding: 7px 8px;
      border-bottom: 2px solid #e4e4e7;
      font-size: 10px;
      color: #52525b;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    table.data td {
      padding: 7px 8px;
      border-bottom: 1px solid #f4f4f5;
      font-size: 12px;
      word-wrap: break-word;
    }
    table.data tr { page-break-inside: avoid; break-inside: avoid; }
    table.data tbody tr:nth-child(even) { background: #fafafa; }
    .empty { color: #71717a; margin: 8px 0 16px; }
    .note { color: #71717a; font-size: 11px; margin: -4px 0 16px; }
    .kpis { width: 100%; border-collapse: collapse; margin: 0 0 16px; }
    .kpis td { width: 25%; padding: 10px 12px; vertical-align: top; background: #f8fafc; border: 4px solid #ffffff; }
    .kpis .label { font-size: 10px; color: #0f766e; text-transform: uppercase; letter-spacing: 0.04em; }
    .kpis .value { font-size: 18px; font-weight: 700; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">Bidinn CRM</div>
    <h1>${escapeHtml(title)}</h1>
  </div>
  ${body}
</body>
</html>`;
}

function table(headers: string[], rows: string[][], empty: string): string {
  if (rows.length === 0) {
    return `<p class="empty">${escapeHtml(empty)}</p>`;
  }
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((cols) => `<tr>${cols.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function capped<T>(rows: T[]): { slice: T[]; extra: number } {
  if (rows.length <= TABLE_CAP) return { slice: rows, extra: 0 };
  return { slice: rows.slice(0, TABLE_CAP), extra: rows.length - TABLE_CAP };
}

function note(extra: number): string {
  return extra > 0 ? `<p class="note">…and ${extra} more</p>` : "";
}

export function renderDelayReportHtml(view: DelayReportView): string {
  const overdue = capped(view.overdue);
  const idle = capped(view.idle);
  const hasAvg = view.agents.some((a) => a.avg_response != null);

  const overdueRows = overdue.slice.map((l) => [
    escapeHtml(l.name),
    escapeHtml(l.assigned_name),
    escapeHtml(String(l.days)),
    escapeHtml(l.last_activity),
  ]);
  const idleRows = idle.slice.map((l) => [
    escapeHtml(l.name),
    escapeHtml(l.assigned_name),
    escapeHtml(String(l.days)),
    escapeHtml(l.last_activity),
  ]);
  const agentHeaders = hasAvg
    ? ["Agent", "Overdue follow-ups", "Idle leads", "Avg first-call"]
    : ["Agent", "Overdue follow-ups", "Idle leads"];
  const agentRows = view.agents.map((a) => {
    const cols = [
      escapeHtml(a.agent_name),
      escapeHtml(String(a.overdue_count)),
      escapeHtml(String(a.idle_count)),
    ];
    if (hasAvg) cols.push(escapeHtml(formatMinutesAsDuration(a.avg_response)));
    return cols;
  });

  const body = `
    <p class="meta">Generated ${escapeHtml(view.generatedAt)}</p>
    <p style="margin:0 0 16px;font-size:13px;">
      <strong>${view.overdue.length}</strong> overdue follow-up${view.overdue.length === 1 ? "" : "s"}
      · <strong>${view.idle.length}</strong> idle lead${view.idle.length === 1 ? "" : "s"} (5+ days, no activity)
    </p>
    <h2>Overdue follow-ups</h2>
    ${table(["Lead", "Assigned rep", "Days overdue", "Last activity"], overdueRows, "No overdue follow-ups.")}
    ${note(overdue.extra)}
    <h2>Idle leads (5+ days)</h2>
    ${table(["Lead", "Assigned rep", "Days idle", "Last activity"], idleRows, "No idle leads.")}
    ${note(idle.extra)}
    <h2>By agent</h2>
    ${table(agentHeaders, agentRows, "No delayed leads assigned to agents.")}
  `;
  return wrap("Delay Report", body);
}

export function renderSummaryReportHtml(view: SummaryReportView): string {
  const sourceRows = view.new_leads_by_source.map((s) => [
    escapeHtml(s.source),
    escapeHtml(String(s.count)),
  ]);
  const agentCols = (rows: SummaryReportView["top_agents"]) =>
    rows.map((a) => [
      escapeHtml(a.agent_name),
      escapeHtml(String(a.converted)),
      escapeHtml(formatInr(a.total_revenue)),
    ]);

  const body = `
    <p class="meta">${escapeHtml(view.periodLabel)}</p>
    <p class="meta">Generated ${escapeHtml(view.generatedAt)}</p>
    <table class="kpis">
      <tr>
        <td>
          <div class="label">New leads</div>
          <div class="value">${view.new_leads}</div>
        </td>
        <td>
          <div class="label">Won / Lost</div>
          <div class="value">${view.closed_won} / ${view.closed_lost}</div>
        </td>
        <td>
          <div class="label">Revenue</div>
          <div class="value">${escapeHtml(formatInr(view.revenue))}</div>
        </td>
        <td>
          <div class="label">Conversion</div>
          <div class="value">${view.conversion_rate}%</div>
        </td>
      </tr>
    </table>
    <p style="font-size:13px;margin:0 0 16px;">As of send time: <strong>${view.overdue_count}</strong> overdue follow-ups · <strong>${view.idle_count}</strong> idle leads</p>
    <h2>New leads by source</h2>
    ${table(["Source", "Count"], sourceRows, "No new leads in this period.")}
    <h2>Top agents</h2>
    ${table(["Agent", "Won", "Revenue"], agentCols(view.top_agents), "No agent activity in this period.")}
    <h2>Bottom agents</h2>
    ${table(["Agent", "Won", "Revenue"], agentCols(view.bottom_agents), "No agent activity in this period.")}
  `;
  return wrap(view.title, body);
}
