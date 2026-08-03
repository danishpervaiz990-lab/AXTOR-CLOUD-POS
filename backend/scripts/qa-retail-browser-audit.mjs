import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const runtimePath = 'retail-live-audit-runtime.json';
const reportPath = 'retail-live-audit-report.json';
const runtime = JSON.parse(await fs.readFile(runtimePath, 'utf8'));
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const evidenceDir = 'retail-browser-evidence';
const backendOrigin = runtime.backendOrigin || report.environment?.backendUrl || 'https://axtor-cloud-pos-production.up.railway.app';
await fs.mkdir(evidenceDir, { recursive: true });

function cleanErrors(errors) {
  return errors.filter((message) => !/favicon|ERR_ABORTED|Failed to load resource.*404/i.test(message));
}

function roleFamily(value) {
  const role = String(value || '').trim().toLowerCase();
  if (/owner|administrator|\badmin\b/.test(role)) return 'owner';
  if (/manager|supervisor/.test(role)) return 'manager';
  if (/cashier|till operator/.test(role)) return 'cashier';
  if (/salesman|salesperson|sales representative|van sales/.test(role)) return 'salesman';
  if (/storekeeper|warehouse/.test(role)) return 'storekeeper';
  if (/accountant|finance/.test(role)) return 'accountant';
  if (/auditor|audit/.test(role)) return 'auditor';
  return role.replace(/\b(retail|grocery|pharmacy|hardware|paint|general)\b/g, '').replace(/\s+/g, ' ').trim();
}

async function prepareLoginIdentity(page, userEmail, businessSlug) {
  const email = String(userEmail || '').trim().toLowerCase();
  const slug = String(businessSlug || '').trim().toLowerCase();
  await page.locator('#loginEmail').fill(email);
  const workspace = page.locator('#businessSlug');
  const editable = await workspace.isEditable().catch(() => false);
  if (editable) {
    await workspace.fill(slug);
    return;
  }
  await page.waitForFunction(
    ({ expectedEmail, expectedSlug }) => {
      const value = String(document.querySelector('#businessSlug')?.value || '').trim().toLowerCase();
      return value === expectedEmail || value === expectedSlug;
    },
    { expectedEmail: email, expectedSlug: slug },
    { timeout: 10000 },
  );
}

async function verifyBackendSession(token) {
  const response = await fetch(`${backendOrigin}/api/v1/auth/me`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(`Backend session verification failed with HTTP ${response.status}: ${payload?.error?.message || 'invalid response'}`);
  }
  return payload;
}

async function waitForSynchronizedStatus(page, selector) {
  try {
    await page.waitForFunction((target) => {
      const element = document.querySelector(target);
      const text = String(element?.textContent || '').trim();
      return /^Live database totals synchronized\. Updated /i.test(text)
        && !/loading|unable|failed|unavailable/i.test(text);
    }, selector, { timeout: 45000 });
  } catch (error) {
    const current = await page.locator(selector).textContent().catch(() => 'status element missing');
    throw new Error(`Retail reporting did not complete: ${String(current || '').trim() || error.message}`);
  }
}

async function waitForPlatformSettled(page) {
  await page.waitForFunction(() => {
    const context = window.AxtorPlatform?.getContext?.();
    return Boolean(context?.plan?.code && context?.features);
  }, null, { timeout: 45000 });
  await page.waitForTimeout(1800);
}

async function readRetailReportingState(page, mode) {
  return page.evaluate((view) => {
    const text = (selector) => String(document.querySelector(selector)?.textContent || '').trim();
    const chartReady = (selector) => {
      const canvas = document.querySelector(selector);
      return Boolean(canvas && window.Chart && typeof window.Chart.getChart === 'function' && window.Chart.getChart(canvas));
    };
    const platformContext = window.AxtorPlatform?.getContext?.() || null;
    const planBlock = document.querySelector('.axtor-plan-block');
    const planBlockVisible = Boolean(planBlock && getComputedStyle(planBlock).display !== 'none' && getComputedStyle(planBlock).visibility !== 'hidden' && planBlock.getBoundingClientRect().width > 0 && planBlock.getBoundingClientRect().height > 0);
    const reportFeatures = Object.entries(platformContext?.features || {})
      .filter(([key, value]) => key.startsWith('reports') && value?.enabled !== false)
      .map(([key]) => key)
      .sort();
    const common = {
      planCode: String(platformContext?.plan?.code || ''),
      reportFeatures,
      dailyReportEntryAllowed: Boolean(window.AxtorPlatform?.hasFeature?.('reports.daily_sales')),
      planBlockVisible,
      planBlockText: planBlockVisible ? String(planBlock?.innerText || '').trim() : '',
    };
    if (view === 'sales') {
      return {
        ...common,
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
      ...common,
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
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
    let backendSessionVerified = false;
    let observedRoles = [];
    let storedRoles = [];
    let tokenStored = false;
    let finalUrl = '';
    let salesReportsSync = user.key === 'owner' ? false : null;
    let salesReporting = null;
    let reportsReporting = null;
    try {
      await page.goto(`${runtime.publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await prepareLoginIdentity(page, user.email, runtime.ids.businessSlug || report.environment.businessSlug);
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
      storedRoles = [...new Set([session.user?.role, ...(Array.isArray(session.user?.roles) ? session.user.roles : [])].filter(Boolean).map(String))];

      const verifiedSession = await verifyBackendSession(session.token);
      backendSessionVerified = true;
      observedRoles = [...new Set([verifiedSession.user?.role, ...(Array.isArray(verifiedSession.user?.roles) ? verifiedSession.user.roles : [])].filter(Boolean).map(String))];
      const expectedRoleFamily = roleFamily(user.role);
      roleOk = observedRoles.some((role) => roleFamily(role) === expectedRoleFamily);
      loginOk = tokenStored
        && String(session.business?.slug || '').toLowerCase() === String(report.environment.businessSlug).toLowerCase()
        && String(verifiedSession.business?.slug || '').toLowerCase() === String(report.environment.businessSlug).toLowerCase();

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
        await waitForPlatformSettled(page);
        salesReporting = await readRetailReportingState(page, 'sales');
        await page.screenshot({ path: `${evidenceDir}/owner-sales-overview-synchronized.png`, fullPage: true });

        await page.goto(`${runtime.publicOrigin}/apps/retail/reports.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await waitForSynchronizedStatus(page, '#retailReportingStatus');
        await waitForPlatformSettled(page);
        reportsReporting = await readRetailReportingState(page, 'reports');
        await page.screenshot({ path: `${evidenceDir}/owner-retail-reports-synchronized.png`, fullPage: true });

        const meaningfulSales = [salesReporting.gross, salesReporting.paid, salesReporting.outstanding, salesReporting.returns]
          .every((value) => value && !/loading|unavailable/i.test(value));
        const reconciledRowsPass = reportsReporting.reconciliation.length >= 4 && reportsReporting.reconciliation.every((row) => /PASS/i.test(row));
        const sourceReportTierPresent = reportsReporting.reportFeatures.some((feature) => ['reports.daily_sales', 'reports.standard', 'reports.advanced', 'reports.*'].includes(feature));
        const reportEntitlementPresent = sourceReportTierPresent && reportsReporting.dailyReportEntryAllowed;
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
          && !salesReporting.planBlockVisible
          && !reportsReporting.planBlockVisible
          && reportEntitlementPresent
          && reconciledRowsPass;
      }
    } catch (error) {
      errors.push(`browser: ${error.message}`);
      if (user.key === 'owner' && !page.isClosed()) {
        await page.screenshot({ path: `${evidenceDir}/owner-reporting-failure.png`, fullPage: true }).catch(() => {});
      }
    }
    const filtered = cleanErrors(errors);
    const reportingOk = user.key === 'owner' ? salesReportsSync === true : true;
    const result = loginOk && backendSessionVerified && roleOk && retailRouteOk && sidebarOk && reportingOk && filtered.length === 0 ? 'PASS' : 'FAIL';
    results.push({
      user: user.label,
      role: user.role,
      observedRoles,
      storedRoles,
      backendSessionVerified,
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
report.acceptance['Five-login browser test'] = { result: allPass ? 'PASS' : 'FAIL', detail: allPass ? 'All five users signed in through the actual login page in fresh browser contexts, verified their backend sessions and loaded the dedicated Retail application' : 'One or more browser login/backend-session/route/sidebar checks failed' };
report.acceptance['Sales Overview and Reports UI reconciliation'] = {
  result: reportingPass ? 'PASS' : 'FAIL',
  detail: reportingPass
    ? 'Gross sales, paid invoices, outstanding credit and returns match; Monthly Sales, Payment Mix, Top Products and reconciliation rendered from the same live summary with inherited paid-plan report access and no plan-block overlay'
    : 'Sales Overview and Reports did not fully reconcile, a required chart/table failed to render, inherited report access was absent, or an incorrect plan-block overlay remained visible',
};
for (const row of report.users) {
  const browserRow = results.find((item) => item.user === row.user);
  if (browserRow) row.browserLoginResult = browserRow.result;
}
if (!allPass || !reportingPass) report.overall = 'FAIL';
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(`Browser audit completed: ${allPass && reportingPass ? 'PASS' : 'FAIL'} for ${results.length} accounts; Sales/Reports sync and inherited plan access ${reportingPass ? 'PASS' : 'FAIL'}.`);
