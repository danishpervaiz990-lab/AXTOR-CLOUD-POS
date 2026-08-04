import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const runtime = JSON.parse(await fs.readFile('pharmacy-live-audit-runtime.json', 'utf8'));
const report = JSON.parse(await fs.readFile('pharmacy-live-audit-report.json', 'utf8'));
const evidenceDir = 'pharmacy-browser-evidence';
await fs.mkdir(evidenceDir, { recursive: true });

const pages = [
  ['dashboard', '/apps/pharmacy/pharmacy-dashboard.html', ['Pharmacy', 'Expiry', 'Prescription']],
  ['terminal', '/apps/pharmacy/pharmacy-terminal.html', ['Pharmacy Terminal', 'FEFO']],
  ['medicines', '/apps/pharmacy/pharmacy-medicines.html', ['Medicines', 'Generic']],
  ['prescriptions', '/apps/pharmacy/pharmacy-prescriptions.html', ['Prescriptions']],
  ['expiry', '/apps/pharmacy/pharmacy-expiry-alerts.html', ['Expiry']],
  ['suppliers', '/apps/pharmacy/pharmacy-suppliers.html', ['Suppliers']],
  ['billing', '/apps/pharmacy/pharmacy-billing.html', ['Pharmacy Billing']],
  ['reports', '/apps/pharmacy/pharmacy-reports.html', ['Reports']],
];

function roleFamily(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role.includes('owner')) return 'owner';
  if (role.includes('manager') || role.includes('supervisor')) return 'manager';
  if (role.includes('cashier') || role.includes('till operator')) return 'cashier';
  if (role.includes('salesman') || role.includes('salesperson') || role.includes('sales representative') || role.includes('van sales')) return 'salesman';
  return role;
}

function meaningful(errors, user) {
  const restrictedRole = ['cashier', 'salesman'].includes(roleFamily(user.role));
  return errors.filter((message) => {
    if (/favicon|robots\.txt|ERR_ABORTED|Failed to load resource.*404|chrome-extension/i.test(message)) return false;
    if (restrictedRole && /(?:http 403: .*\/api\/v1\/(?:industry\/(?:records|batches)|reports\/)|Failed to load resource: the server responded with a status of 403)/i.test(message)) return false;
    return true;
  });
}

function attachDiagnostics(page, errors) {
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`); });
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
  if (!response.ok || !payload?.ok) throw new Error(`Authenticated session verification returned HTTP ${response.status}`);
  return payload;
}

async function verifyRoute(context, user, key, route, required) {
  const pageErrors = [];
  let last = { key, route, ok: false, finalUrl: '', body: '', errors: [] };
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const page = await context.newPage();
    attachDiagnostics(page, pageErrors);
    try {
      await page.goto(`${runtime.publicOrigin}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction((terms) => {
        const body = String(document.body?.innerText || '');
        const lower = body.toLowerCase();
        const loading = /loading pharmacy|loading…|saving…/i.test(body);
        return !loading && terms.every((term) => lower.includes(String(term).toLowerCase()));
      }, required, { timeout: 45000 }).catch(() => null);
      const body = await page.locator('body').innerText().catch(() => '');
      const filtered = meaningful(pageErrors, user);
      const pathname = new URL(page.url()).pathname;
      const ok = pathname === route
        && required.every((term) => body.toLowerCase().includes(term.toLowerCase()))
        && !/page not found|404|authentication required|unauthorized|forbidden/i.test(body)
        && filtered.length === 0;
      last = { key, route, ok, finalUrl: page.url(), body: body.slice(0, 500), errors: filtered };
      if (user.key === 'owner') {
        await page.screenshot({ path: `${evidenceDir}/owner-${key}.png`, fullPage: true }).catch(() => undefined);
      }
      await page.close();
      if (ok) return last;
    } catch (error) {
      last = { key, route, ok: false, finalUrl: page.url(), body: '', errors: meaningful([...pageErrors, `route: ${error.message}`], user) };
      if (user.key === 'owner') {
        await page.screenshot({ path: `${evidenceDir}/owner-${key}-failure.png`, fullPage: true }).catch(() => undefined);
      }
      await page.close().catch(() => undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return last;
}

const roleOrder = new Map([['cashier1', 1], ['cashier2', 2], ['van', 3], ['manager', 4], ['owner', 5]]);
const auditUsers = [...runtime.users].sort((a, b) => (roleOrder.get(a.key) || 99) - (roleOrder.get(b.key) || 99));
const businessSlug = runtime.ids?.businessSlug || report.environment?.businessSlug;
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const user of auditUsers) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const loginErrors = [];
    let loginOk = false;
    let roleOk = false;
    let tenantOk = false;
    let observedRoles = [];
    const pageResults = [];

    try {
      const loginPage = await context.newPage();
      attachDiagnostics(loginPage, loginErrors);
      await loginPage.goto(`${runtime.publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await prepareLoginIdentity(loginPage, user.email, businessSlug);
      await loginPage.locator('#loginPassword').fill(user.password);
      await Promise.all([
        loginPage.locator('#loginButton').click(),
        loginPage.waitForFunction(() => Boolean(localStorage.getItem('axtorAuthToken')), null, { timeout: 30000 }),
      ]);
      await loginPage.waitForTimeout(900);

      const state = await context.storageState();
      const origin = state.origins.find((entry) => entry.origin === runtime.publicOrigin);
      const values = Object.fromEntries((origin?.localStorage || []).map((entry) => [entry.name, entry.value]));
      const token = values.axtorAuthToken || '';
      loginOk = Boolean(token);
      const session = await backendSession(token);
      observedRoles = [...new Set([session.user?.role, ...(Array.isArray(session.user?.roles) ? session.user.roles : [])].filter(Boolean).map(String))];
      roleOk = observedRoles.some((role) => roleFamily(role) === roleFamily(user.role));
      tenantOk = String(session.business?.slug || '').toLowerCase() === String(businessSlug || '').toLowerCase();
      await loginPage.close();

      if (loginOk && roleOk && tenantOk) {
        for (const [key, route, required] of pages) {
          pageResults.push(await verifyRoute(context, user, key, route, required));
        }
      }
    } catch (error) {
      loginErrors.push(`audit: ${error?.message || String(error) || 'unknown browser audit error'}`);
    }

    const filteredLoginErrors = meaningful(loginErrors, user);
    const pass = loginOk
      && roleOk
      && tenantOk
      && pageResults.length === pages.length
      && pageResults.every((entry) => entry.ok)
      && filteredLoginErrors.length === 0;
    results.push({
      key: user.key,
      role: user.role,
      observedRoles,
      loginOk,
      roleOk,
      tenantOk,
      pages: pageResults,
      errors: filteredLoginErrors,
      pass,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

report.browser = {
  users: results,
  checks: {
    fiveIndependentUsers: results.length === 5,
    allLoginsPass: results.every((item) => item.loginOk),
    allRolesPass: results.every((item) => item.roleOk),
    allTenantsPass: results.every((item) => item.tenantOk),
    allRolesCheckedEveryPage: results.every((item) => item.pages.length === pages.length),
    dedicatedPharmacyPagesPass: results.every((item) => item.pages.length === pages.length && item.pages.every((entry) => entry.ok)),
    expectedRoleRestrictionsPass: results.filter((item) => ['cashier', 'salesman'].includes(roleFamily(item.role))).every((item) => item.errors.length === 0),
    noUnexpectedBrowserErrors: results.every((item) => item.errors.length === 0 && item.pages.every((page) => page.errors.length === 0)),
  },
};
report.overall = Object.values(report.browser.checks).every(Boolean) && report.overall === 'PASS' ? 'PASS' : 'FAIL';
await fs.writeFile('pharmacy-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.browser, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
