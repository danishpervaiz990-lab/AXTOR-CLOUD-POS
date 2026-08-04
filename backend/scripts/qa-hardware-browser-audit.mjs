import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const runtime = JSON.parse(await fs.readFile('hardware-live-audit-runtime.json', 'utf8'));
const report = JSON.parse(await fs.readFile('hardware-live-audit-report.json', 'utf8'));
const publicOrigin = runtime.publicOrigin
  || report.publicOrigin
  || report.environment?.frontendUrl
  || process.env.AXTOR_PUBLIC_ORIGIN;
const backendOrigin = runtime.backendOrigin
  || report.backendOrigin
  || report.environment?.backendUrl
  || process.env.AXTOR_BACKEND_ORIGIN;
if (!publicOrigin || !backendOrigin) throw new Error('Hardware browser audit requires resolved frontend and backend origins');
new URL(publicOrigin);
new URL(backendOrigin);
const evidenceDir = 'hardware-browser-evidence';
await fs.mkdir(evidenceDir, { recursive: true });

const pages = [
  ['dashboard', '/apps/hardware/hardware-dashboard.html', ['Hardware', 'Projects']],
  ['terminal', '/apps/hardware/hardware-terminal.html', ['Trade Checkout', 'Products']],
  ['projects', '/apps/hardware/hardware-projects.html', ['Contractor Projects']],
  ['quotations', '/apps/hardware/hardware-quotations.html', ['Quotation']],
  ['price-levels', '/apps/hardware/hardware-price-levels.html', ['Price Level']],
  ['deliveries', '/apps/hardware/hardware-deliveries.html', ['Delivery']],
  ['backorders', '/apps/hardware/hardware-backorders.html', ['Backorder']],
  ['rentals', '/apps/hardware/hardware-rentals.html', ['Rental']],
  ['warranties', '/apps/hardware/hardware-warranties.html', ['Warranty']],
  ['unit-conversions', '/apps/hardware/hardware-unit-conversions.html', ['Unit Conversion']],
  ['reports', '/apps/hardware/hardware-reports.html', ['Reports']],
  ['settings', '/apps/hardware/hardware-settings.html', ['Settings']],
];

function roleFamily(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role.includes('owner')) return 'owner';
  if (role.includes('admin')) return 'admin';
  if (role.includes('manager') || role.includes('supervisor')) return 'manager';
  if (role.includes('cashier') || role.includes('till operator')) return 'cashier';
  if (role.includes('salesperson') || role.includes('salesman') || role.includes('sales representative') || role.includes('van sales')) return 'salesperson';
  return role;
}

function isRestrictedRole(user) {
  return ['cashier', 'salesperson'].includes(roleFamily(user?.role));
}

function cleanErrors(errors, user) {
  const restricted = isRestrictedRole(user);
  return errors.filter((message) => {
    if (/favicon|robots\.txt|ERR_ABORTED|Failed to load resource.*404|chrome-extension/i.test(message)) return false;
    if (restricted && /^console:.*Failed to load resource: the server responded with a status of 403/i.test(message)) return false;
    if (restricted && /^http 403: .*\/api\/v1\/(?:hardware(?:\/|\?|$)|settings(?:\/|\?|$)|reports(?:\/|\?|$))/i.test(message)) return false;
    return true;
  });
}

function attachDiagnostics(page, errors, responses) {
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      const detail = `http ${response.status()}: ${response.url()}`;
      errors.push(detail);
      responses.push({ status: response.status(), url: response.url() });
    }
  });
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
  const response = await fetch(`${backendOrigin}/api/v1/auth/me`, {
    cache: 'no-store',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(`Authenticated session verification returned HTTP ${response.status}`);
  return payload;
}

async function verifyRoute(context, user, key, route, terms) {
  let last = { key, route, ok: false, restricted: false, dataRows: 0, finalUrl: '', errors: [], denials: [] };
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const page = await context.newPage();
    const errors = [];
    const responses = [];
    attachDiagnostics(page, errors, responses);
    try {
      await page.goto(`${publicOrigin}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction((required) => {
        const body = String(document.body?.innerText || '');
        const lower = body.toLowerCase();
        const loading = /loading…|loading\.\.\.|saving…|saving\.\.\./i.test(body);
        return !loading && required.every((term) => lower.includes(String(term).toLowerCase()));
      }, terms, { timeout: 45000 }).catch(() => null);
      await page.waitForTimeout(700);
      const state = await page.evaluate(() => {
        const body = String(document.body?.innerText || '');
        const rows = [...document.querySelectorAll('#app table tbody tr, #app .h-item, #app .h-cart-row')];
        const dataRows = rows.filter((row) => {
          const cells = row.querySelectorAll?.('td')?.length || 0;
          const text = String(row.textContent || '').trim();
          return cells > 1 || (text && !/loading|no records|no matching|cart is empty/i.test(text));
        }).length;
        return {
          body,
          appExists: Boolean(document.querySelector('#app')),
          checkoutExists: Boolean(document.querySelector('#checkoutForm')),
          dataRows,
        };
      });
      const denials = responses.filter((entry) => entry.status === 403 && /\/api\/v1\/(?:hardware(?:\/|\?|$)|settings(?:\/|\?|$)|reports(?:\/|\?|$))/i.test(entry.url));
      const restricted = isRestrictedRole(user) && denials.length > 0;
      const relevantErrors = cleanErrors(errors, user);
      const structural = terms.every((term) => state.body.toLowerCase().includes(term.toLowerCase()))
        && state.appExists
        && (key !== 'terminal' || state.checkoutExists)
        && !/page not found|404/i.test(state.body);
      const restrictionSafe = !restricted || state.dataRows === 0;
      last = {
        key,
        route,
        ok: structural && restrictionSafe && relevantErrors.length === 0,
        restricted,
        dataRows: state.dataRows,
        finalUrl: page.url(),
        errors: relevantErrors,
        denials,
      };
      if (user.key === 'owner') {
        await page.screenshot({ path: `${evidenceDir}/owner-${key}.png`, fullPage: true }).catch(() => undefined);
      }
      await page.close();
      if (last.ok) return last;
    } catch (error) {
      last = { ...last, finalUrl: page.url(), errors: cleanErrors([...errors, `route: ${error.message}`], user) };
      await page.close().catch(() => undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return last;
}

const businessSlug = runtime.ids?.businessSlug || report.environment?.businessSlug;
const roleOrder = new Map([['cashier1', 1], ['cashier2', 2], ['van', 3], ['manager', 4], ['owner', 5]]);
const auditUsers = [...runtime.users].sort((a, b) => (roleOrder.get(a.key) || 99) - (roleOrder.get(b.key) || 99));
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
      const responses = [];
      attachDiagnostics(loginPage, loginErrors, responses);
      const loginUrl = new URL('/login.html', publicOrigin);
      loginUrl.searchParams.set('email', user.email);
      await loginPage.goto(loginUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
      await prepareLoginIdentity(loginPage, user.email, businessSlug);
      await loginPage.locator('#loginPassword').fill(user.password);
      await Promise.all([
        loginPage.locator('#loginButton').click(),
        loginPage.waitForFunction(() => Boolean(localStorage.getItem('axtorAuthToken')), null, { timeout: 30000 }),
      ]);
      await loginPage.waitForTimeout(900);
      const state = await context.storageState();
      const origin = state.origins.find((entry) => entry.origin === publicOrigin);
      const values = Object.fromEntries((origin?.localStorage || []).map((entry) => [entry.name, entry.value]));
      const token = values.axtorAuthToken || '';
      loginOk = Boolean(token);
      const session = await backendSession(token);
      observedRoles = [...new Set([session.user?.role, ...(Array.isArray(session.user?.roles) ? session.user.roles : [])].filter(Boolean).map(String))];
      roleOk = observedRoles.some((role) => roleFamily(role) === roleFamily(user.role));
      tenantOk = String(session.business?.slug || '').toLowerCase() === String(businessSlug || '').toLowerCase();
      await loginPage.close();
      if (loginOk && roleOk && tenantOk) {
        for (const [key, route, terms] of pages) pageResults.push(await verifyRoute(context, user, key, route, terms));
      }
    } catch (error) {
      loginErrors.push(`audit: ${error?.message || String(error) || 'unknown Hardware browser audit error'}`);
    }
    const relevantLoginErrors = cleanErrors(loginErrors, user);
    const pass = loginOk
      && roleOk
      && tenantOk
      && pageResults.length === pages.length
      && pageResults.every((entry) => entry.ok)
      && relevantLoginErrors.length === 0;
    results.push({ key: user.key, role: user.role, observedRoles, loginOk, roleOk, tenantOk, pages: pageResults, errors: relevantLoginErrors, pass });
    await context.close();
  }
} finally {
  await browser.close();
}

const restrictedUsers = results.filter((item) => ['cashier', 'salesperson'].includes(roleFamily(item.role)));
report.browser = {
  users: results,
  checks: {
    fiveIndependentUsers: results.length === 5,
    allLoginsPass: results.every((item) => item.loginOk),
    allRolesPass: results.every((item) => item.roleOk),
    allTenantsPass: results.every((item) => item.tenantOk),
    allRolesCheckedEveryPage: results.every((item) => item.pages.length === pages.length),
    dedicatedHardwarePagesPass: results.every((item) => item.pages.length === pages.length && item.pages.every((entry) => entry.ok)),
    expectedRestrictionDataIsolationPass: restrictedUsers.every((item) => item.pages.filter((page) => page.restricted).every((page) => page.dataRows === 0)),
    noUnexpectedBrowserErrors: results.every((item) => item.errors.length === 0 && item.pages.every((page) => page.errors.length === 0)),
  },
};
report.overall = report.overall === 'PASS' && Object.values(report.browser.checks).every(Boolean) ? 'PASS' : 'FAIL';
await fs.writeFile('hardware-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.browser, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
