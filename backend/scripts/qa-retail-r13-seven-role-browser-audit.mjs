import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const runtimePath = 'retail-r13-seven-role-runtime.json';
const reportPath = 'retail-r13-seven-role-report.json';
const evidenceDir = 'retail-r13-browser-evidence';
const runtime = JSON.parse(await fs.readFile(runtimePath, 'utf8'));
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
await fs.mkdir(evidenceDir, { recursive: true });

function roleFamily(value) {
  const role = String(value || '').trim().toLowerCase();
  if (/owner/.test(role)) return 'owner';
  if (/manager|supervisor/.test(role)) return 'manager';
  if (/cashier|till operator/.test(role)) return 'cashier';
  if (/salesperson|salesman|sales representative|van sales/.test(role)) return 'salesperson';
  if (/storekeeper|warehouse/.test(role)) return 'storekeeper';
  if (/accountant|finance/.test(role)) return 'accountant';
  if (/auditor|audit/.test(role)) return 'auditor';
  return role;
}

function cleanErrors(errors) {
  return errors.filter((message) => !/favicon|ERR_ABORTED|Failed to load resource.*404|chrome-extension/i.test(message));
}

async function prepareLoginIdentity(page, email, businessSlug) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedSlug = String(businessSlug || '').trim().toLowerCase();
  await page.locator('#loginEmail').fill(normalizedEmail);
  const workspace = page.locator('#businessSlug');
  const editable = await workspace.isEditable().catch(() => false);
  if (editable) {
    await workspace.fill(normalizedSlug);
    return;
  }
  await page.waitForFunction(
    ({ expectedEmail, expectedSlug }) => {
      const value = String(document.querySelector('#businessSlug')?.value || '').trim().toLowerCase();
      return value === expectedEmail || value === expectedSlug;
    },
    { expectedEmail: normalizedEmail, expectedSlug: normalizedSlug },
    { timeout: 10000 },
  );
}

async function backendSession(token) {
  const response = await fetch(`${runtime.backendOrigin}/api/v1/auth/me`, {
    cache: 'no-store',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(`Authenticated session verification returned HTTP ${response.status}`);
  }
  return payload;
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const user of runtime.users) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: 'block',
    });
    let page = await context.newPage();
    const errors = [];
    const responses = [];
    const attachDiagnostics = (target) => {
      target.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      target.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      target.on('response', (response) => {
        if (response.status() >= 400) {
          const detail = `http ${response.status()}: ${response.url()}`;
          errors.push(detail);
          responses.push(detail);
        }
      });
    };
    attachDiagnostics(page);

    let tokenStored = false;
    let loginPage = false;
    let backendSessionVerified = false;
    let roleResolved = false;
    let tenantResolved = false;
    let dedicatedRetailRoute = false;
    let dashboardLoaded = false;
    let finalUrl = '';
    let observedRoles = [];
    let sidebarLabels = [];

    try {
      await page.goto(`${runtime.publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await prepareLoginIdentity(page, user.email, runtime.businessSlug);
      await page.locator('#loginPassword').fill(user.password);
      await Promise.all([
        page.locator('#loginButton').click(),
        page.waitForFunction(() => Boolean(localStorage.getItem('axtorAuthToken')), null, { timeout: 30000 }),
      ]);
      await page.waitForTimeout(900);

      const state = await context.storageState();
      const origin = state.origins.find((entry) => entry.origin === runtime.publicOrigin);
      const values = Object.fromEntries((origin?.localStorage || []).map((entry) => [entry.name, entry.value]));
      const token = values.axtorAuthToken || '';
      tokenStored = Boolean(token);
      loginPage = tokenStored;

      const session = await backendSession(token);
      backendSessionVerified = true;
      observedRoles = [...new Set([
        session.user?.role,
        ...(Array.isArray(session.user?.roles) ? session.user.roles : []),
      ].filter(Boolean).map(String))];
      roleResolved = observedRoles.some((role) => roleFamily(role) === roleFamily(user.role));
      tenantResolved = String(session.business?.slug || '').toLowerCase() === String(runtime.businessSlug).toLowerCase();

      await page.close();
      page = await context.newPage();
      attachDiagnostics(page);
      await page.goto(`${runtime.publicOrigin}/apps/retail/retail-dashboard.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await page.waitForTimeout(3500);
      finalUrl = page.url();
      const parsed = new URL(finalUrl);
      dedicatedRetailRoute = parsed.pathname === '/apps/retail/retail-dashboard.html';
      const body = await page.locator('body').innerText().catch(() => '');
      dashboardLoaded = /dashboard/i.test(body) && !/page not found|404|unauthorized|forbidden/i.test(body);
      sidebarLabels = await page.locator('aside a, nav a, .sidebar a').allInnerTexts().catch(() => []);
      await page.screenshot({
        path: `${evidenceDir}/${user.key}-${roleFamily(user.role)}-retail-dashboard.png`,
        fullPage: true,
      });
    } catch (error) {
      errors.push(`browser: ${error.message}`);
      if (!page.isClosed()) {
        await page.screenshot({
          path: `${evidenceDir}/${user.key}-${roleFamily(user.role)}-failure.png`,
          fullPage: true,
        }).catch(() => {});
      }
    }

    const filteredErrors = cleanErrors(errors);
    const result = tokenStored
      && loginPage
      && backendSessionVerified
      && roleResolved
      && tenantResolved
      && dedicatedRetailRoute
      && dashboardLoaded
      && filteredErrors.length === 0
        ? 'PASS'
        : 'FAIL';

    results.push({
      key: user.key,
      label: user.label,
      expectedRole: user.role,
      observedRoles,
      tokenStored,
      loginPage,
      backendSessionVerified,
      roleResolved,
      tenantResolved,
      dedicatedRetailRoute,
      dashboardLoaded,
      finalUrl,
      sidebarLabels,
      httpFailures: responses,
      consoleErrors: filteredErrors,
      result,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const allPass = results.length === 7 && results.every((entry) => entry.result === 'PASS');
report.browserAudit = results;
report.summary = {
  ...(report.summary || {}),
  browserUsers: results.length,
  browserUsersPassed: results.filter((entry) => entry.result === 'PASS').length,
};
report.overall = report.overall === 'PASS' && allPass ? 'PASS' : 'FAIL';
report.browserVerifiedAt = new Date().toISOString();
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(`Retail R-13 seven-role browser audit: ${results.filter((entry) => entry.result === 'PASS').length}/${results.length} PASS; overall ${report.overall}`);
if (report.overall !== 'PASS') process.exit(1);
