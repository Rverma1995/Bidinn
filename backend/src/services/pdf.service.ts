import { DelayReportView, renderDelayReportHtml, renderSummaryReportHtml, SummaryReportView } from "./report-templates";

export type ReportTemplateName = "delay" | "weekly" | "monthly";

export type ReportPdfData = DelayReportView | SummaryReportView;

export interface ReportPdfRenderer {
  generateReportPdf(templateName: ReportTemplateName, data: ReportPdfData): Promise<Buffer>;
}

function htmlForTemplate(templateName: ReportTemplateName, data: ReportPdfData): string {
  if (templateName === "delay") {
    return renderDelayReportHtml(data as DelayReportView);
  }
  return renderSummaryReportHtml(data as SummaryReportView);
}

/**
 * Shared HTML→PDF path for delay / weekly / monthly reports.
 * Launches Chromium per call (a handful of cron PDFs a day, not a request hot path).
 */
export async function generateReportPdf(templateName: ReportTemplateName, data: ReportPdfData): Promise<Buffer> {
  return htmlToPdf(htmlForTemplate(templateName, data));
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  // Puppeteer >=22 is ESM-only. ts-node rewrites `import()` to `require()` in CJS,
  // so load it through Function to keep a real dynamic import at runtime.
  const loadEsm = new Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<{ default?: typeof import("puppeteer") } & typeof import("puppeteer")>;

  let puppeteer: typeof import("puppeteer");
  try {
    const mod = await loadEsm("puppeteer");
    puppeteer = (mod.default || mod) as typeof import("puppeteer");
  } catch (error) {
    console.error("PDF generation skipped: puppeteer is not installed", error);
    throw error;
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "14mm", right: "12mm", bottom: "18mm", left: "12mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="font-size:9px;width:100%;text-align:center;color:#71717a;font-family:Arial,Helvetica,sans-serif;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export const reportPdfRenderer: ReportPdfRenderer = { generateReportPdf };
