import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const runtimePath = 'retail-live-audit-runtime.json';
const reportPath = 'retail-live-audit-report.json';
const runtime = JSON.parse(await fs.readFile(runtimePath, 'utf8'));
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const evidenceDir = 'retail-browser-evidence';
await fs.mkdir(evidenceDir, { recursive: true });

function cleanErrors(errors) {
  return errors.filter((message) => !/favicon|ERR_ABORTED|Failed to load resource.*404/i.test(message));
}

async function waitForSynchronizedStatus(page, selector) {
  await page.waitForFunction((target) => {
    const element = document.querySelector(target);
    const text = String(element?.textContent || '');
    return /synchronized/i.test(text) && !/unable|failed|unavailable/i.test(text);
  }, selector, { timeout: 45000 });
}

async function readRetailReportingState(page, mode) {
  return page.evaluate((view) => {
    const text = (selector) => String(document.querySelector(selector)?.textContent || '').trim();
    const chartReady = (selector) => {
      const canvas = document.querySelector(selector);
      return Boolean(canvas && window.Chart && typeof window.Chart.getChart === 'function' && window.Chart.getChart(canvas));
    };
    if (view === 'sales') {
      return {
        gross: text('#salesOverviewGross'),
        paid: text('#salesOverviewPaid'),
        outstanding: text('#salesOverviewCredit'),
        returns: text('#salesOverviewReturns'),
        monthlyChart: chartReady('#salesTrendChart'),
        paymentChart: chartReady('#paymentMixChart'),
        topProductRows: document.querySelectorAll('#salesOverviewTopProductsBody tr').length,
        liveStatus: text('#salesOverviewLiveStatus'),
      };
    }
    const reconciliation = Array.from(document.querySelectorAll('#retailReconciliationBody tr')).map((row) => row.innerText.trim());
    return {
      gross: text('#reportGrossSales'),
      paid: text('#reportPaidInvoices'),
      outstanding: text('#reportOutstanding'),
      returns: text('#reportReturns'),
      monthlyChart: chartReady('#retailMonthlySalesChart'),
      paymentChart: chartReady('#retailPaymentMixChart'),
      topProductRows: document.querySelectorAll('#retailTopProductsBody tr').length,
      reconciliation,
      liveStatus: text('#retailReportingStatus'),
    };
  }, mode);
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const user of runtime.users) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    let page = await context.newPage();
    const errors = [];
    const attachDiagnostics = (targetPage) => {
      targetPage.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
      targetPage.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      targetPage.on('response', (response) => {
        if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
      });
    };
    attachDiagnostics(page);
    let loginOk = false;
    let retailRouteOk = false;
    let sidebarOk = false;
    let roleOk = false;
    let tokenStored = false;
    let finalUrl = '';
    let salesReportsSync = user.key === 'owner' ? false : null;
    let salesReporting = null;
    let reportsReporting = null;
    try {
      await page.goto(`${runtime.publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('#businessSlug').fill(runtime.ids.businessSlug || report.environment.businessSlug);
      await page.locator('#loginEmail').fill(user.email);
      await page.locator('#loginPassword').fill(user.password);
      await Promise.all([
        page.locator('#loginButton').click(),
        page.waitForFunction(() => Boolean(localStorage.getItem('axtorAuthToken')), null, { timeout: 30000 }),
      ]);
      await page.waitForTimeout(750);
      const storage = await context.storageState();
      const originState = storage.origins.find((entry) => entry.origin === runtime.publicOrigin);
      const values = Object.fromEntries((originState?.localStorage || []).map((entry) => [entry.name, entry.value]));
      const session = { token: values.axtorAuthToken || '', user: JSON.parse(values.currentUser || '{}'), business: JSON.parse(values.axtorBusiness || '{}') };
      tokenStored = Boolean(session.token);
      roleOk = Array.isArray(session.user?.roles) && session.user.roles.some((role) => String(role).toLowerCase() === String(user.role).toLowerCase());
      loginOk = tokenStored && String(session.business?.slug || '').toLowerCase() === String(report.environment.businessSlug).toLowerCase();

      await page.close();
      page = await context.newPage();
      attachDiagnostics(page);
      await page.goto(`${runtime.publicOrigin}/apps/retail/retail-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);
      finalUrl = page.url();
      const body = await page.locator('body').innerText().catch(() => '');
      retailRouteOk = /retail/i.test(body) && !/page not found|404/i.test(body);
      sidebarOk = ['Terminal', 'Sales', 'Customers', 'Products', 'Inventory'].filter((label) => body.includes(label)).length >= 4;
      await page.screenshot({ path: `${evidenceDir}/${user.key}-retail-dashboard.png`, fullPage: true });

      if (user.key === 'owner') {
        await page.goto(`${runtime.publicOrigin}/apps/retail/sales.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await waitForSynchronizedStatus(page, '#salesOverviewLiveStatus');
        salesReporting = await readRetailReportingState(page, 'sales');
        await page.screenshot({ path: `${evidenceDir}/owner-sales-overview-synchronized.png`, fullPage: true });

        await page.goto(`${runtime.publicOrigin}/apps/retail/reports.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await waitForSynchronizedStatus(page, '#retailReportingStatus');
        reportsReporting = await readRetailReportingState(page, 'reports');
        await page.screenshot({ path: `${evidenceDir}/owner-retail-reports-synchronized.png`, fullPage: true });

        const meaningfulSales = [salesReporting.gross, salesReporting.paid, salesReporting.outstanding, salesReporting.returns]
          .every((value) => value && !/loading|unavailable/i.test(value));
        const reconciledRowsPass = reportsReporting.reconciliation.length >= 4 && reportsReporting.reconciliation.every((row) => /PASS/i.test(row));
        salesReportsSync = meaningfulSales
          && salesReporting.gross === reportsReporting.gross
          && salesReporting.paid === reportsReporting.paid
          && salesReporting.outstanding === reportsReporting.outstanding
          && salesReporting.returns === reportsReporting.returns
          && salesReporting.monthlyChart
          && salesReporting.paymentChart
          && reportsReporting.monthlyChart
          && reportsReporting.paymentChart
          && salesReporting.topProductRows > 0
          && reportsReporting.topProductRows > 0
          && reconciledRowsPass;
      }
    } catch (error) {
      errors.push(`browser: ${error.message}`);
    }
    const filtered = cleanErrors(errors);
    const reportingOk = user.key === 'owner' ? salesReportsSync === true : true;
    const result = loginOk && roleOk && retailRouteOk && sidebarOk && reportingOk && filtered.length === 0 ? 'PASS' : 'FAIL';
    results.push({
      user: user.label,
      role: user.role,
      freshContext: true,
      loginPage: loginOk,
      roleResolved: roleOk,
      tokenStored,
      dedicatedRetailRoute: retailRouteOk,
      retailSidebar: sidebarOk,
      salesReportsSync,
      salesReporting,
      reportsReporting,
      finalUrl,
      consoleErrors: filtered,
      result,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

report.browserAudit = results;
const allPass = results.length === 5 && results.every((row) => row.result === 'PASS');
const ownerReporting = results.find((row) => row.salesReportsSync !== null);
const reportingPass = ownerReporting?.salesReportsSync === true;
report.acceptance['Five-login browser test'] = { result: allPass ? 'PASS' : 'FAIL', detail: allPass ? 'All five users signed in through the actual login page in fresh browser contexts and loaded the dedicated Retail application' : 'One or more browser login/route/sidebar checks failed' };
report.acceptance['Sales Overview and Reports UI reconciliation'] = {
  result: reportingPass ? 'PASS' : 'FAIL',
  detail: reportingPass
    ? 'Gross sales, paid invoices, outstanding credit and returns match; Monthly Sales, Payment Mix, Top Products and reconciliation rendered from the same live summary'
    : 'Sales Overview and Reports did not fully reconcile or a required chart/table failed to render',
};
for (const row of report.users) {
  const browserRow = results.find((item) => item.user === row.user);
  if (browserRow) row.browserLoginResult = browserRow.result;
}
if (!allPass || !reportingPass) report.overall = 'FAIL';
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(`Browser audit completed: ${allPass && reportingPass ? 'PASS' : 'FAIL'} for ${results.length} accounts; Sales/Reports sync ${reportingPass ? 'PASS' : 'FAIL'}.`);
