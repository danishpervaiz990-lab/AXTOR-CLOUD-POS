import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const runtime = JSON.parse(await fs.readFile('paint-live-audit-runtime.json', 'utf8'));
const report = JSON.parse(await fs.readFile('paint-live-audit-report.json', 'utf8'));
const backendOrigin = runtime.backendOrigin || report.backendOrigin || process.env.AXTOR_BACKEND_ORIGIN;
const publicOrigin = runtime.publicOrigin || process.env.AXTOR_PUBLIC_ORIGIN;
const businessSlug = runtime.ids?.businessSlug || report.environment?.businessSlug;
if (!backendOrigin || !publicOrigin || !businessSlug) throw new Error('Paint browser certification cannot resolve production origins or tenant slug');

const REPORT_PATH = 'paint-live-audit-report.json';
const evidenceDir = 'paint-browser-evidence';
await fs.mkdir(evidenceDir, { recursive: true });
const pages = [
  ['dashboard', '/apps/paint/paint-dashboard.html', ['Paint']],
  ['deliveries', '/apps/paint/paint-deliveries.html', ['Delivery']],
  ['reports', '/apps/paint/paint-reports.html', ['Reports']],
  ['settings', '/apps/paint/paint-settings.html', ['Settings']],
];
const paintSalesRestrictions = [
  ['Tenant settings read', 'GET', '/api/v1/settings'],
  ['Tenant settings update', 'PUT', '/api/v1/settings/appearance.paint', { value: { theme: 'denied' } }],
  ['Component stock update', 'PUT', '/api/v1/paint/component-stock', { componentCode: 'DENIED', componentName: 'Denied Tinter', quantityOnHand: 1, averageCost: 1 }],
  ['Formula revision create', 'POST', '/api/v1/paint/formulas/denied/revisions', { expectedRevision: 1, notes: 'denied', components: [] }],
  ['Mix job create', 'POST', '/api/v1/paint/mix-jobs', { formulaId: 'denied', quantity: 1, unit: 'ltr', nonReturnableAccepted: true }],
  ['Quality approval', 'POST', '/api/v1/paint/mix-jobs/denied/quality-checks', { result: 'passed', notes: 'denied' }],
  ['Mix label create', 'POST', '/api/v1/paint/mix-jobs/denied/label', {}],
];

const unwrap = (value) => value?.data ?? value;
const roleValue = (value) => String(value && typeof value === 'object' ? value.name || value.role || value.code || '' : value || '').trim().toLowerCase();
const expectedRole = (user) => roleValue(user?.role);
const observedRoles = (user) => [user?.role, ...(Array.isArray(user?.roles) ? user.roles : [])].map(roleValue).filter(Boolean);
const delay = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
const safeClose = async (target, ms = 5000) => Promise.race([target.close().catch(() => undefined), delay(ms)]);

async function persistProgress(results, active = null) {
  report.browserProgress = {
    updatedAt: new Date().toISOString(),
    completedUsers: results,
    active,
  };
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
}

const hardTimer = setTimeout(() => {
  console.error('Paint browser certification exceeded its seven-minute hard limit; partial evidence is stored in the report');
  process.exit(124);
}, 7 * 60 * 1000);

async function jsonRequest(path, { method = 'GET', token, body, expected = [200] } = {}) {
  const response = await fetch(`${backendOrigin}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(body !== undefined ? { 'Idempotency-Key': `paint-browser:${businessSlug}:${method}:${path}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null);
  if (!expected.includes(response.status)) throw new Error(`${method} ${path} -> ${response.status}: ${payload?.error?.message || payload?.message || 'request failed'}`);
  return { status: response.status, payload: unwrap(payload) || {}, raw: payload };
}

async function authenticate(user) {
  const login = await jsonRequest('/api/v1/auth/login', {
    method: 'POST',
    body: { businessSlug, email: user.email, password: user.password },
    expected: [200],
  });
  const token = login.raw?.token || login.payload?.token || login.payload?.accessToken;
  if (!token) throw new Error(`Paint browser login returned no token for ${user.key}`);
  const me = await jsonRequest('/api/v1/auth/me', { token, expected: [200] });
  return {
    token,
    user: me.payload?.user || login.payload?.user || {},
    business: me.payload?.business || login.payload?.business || {},
  };
}

function relevantHttp(events) {
  return events.filter((entry) => !/favicon|robots\.txt/i.test(entry.url));
}
function relevantErrors(errors) {
  return errors.filter((message) => !/favicon|ERR_ABORTED|Failed to load resource.*404/i.test(message));
}

async function inspectPaintPage(page, key, terms) {
  await page.waitForTimeout(3000);
  return page.evaluate(({ key, terms }) => {
    const body = String(document.body?.innerText || '');
    const app = document.querySelector('#app');
    const appText = String(app?.innerText || '').trim();
    const heading = String(document.querySelector('h1')?.textContent || '');
    const lower = `${body}\n${heading}`.toLowerCase();
    const hasTerms = terms.every((term) => lower.includes(String(term).toLowerCase()));
    return {
      key,
      ok: hasTerms && Boolean(app) && body.trim().length > 20 && !/page not found|404/i.test(body),
      restrictedSettingsNotice: Boolean(document.querySelector('#paintSettingsRoleNotice')),
      restrictedReportsNotice: Boolean(document.querySelector('#paintReportsRoleNotice')),
      restrictedEditors: document.querySelectorAll('#paintPrintSettings,#paintBrandingPanel').length,
      appText: appText.slice(0, 500),
    };
  }, { key, terms });
}

async function auditPage(context, user, key, route, terms) {
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  const consoleErrors = [];
  const httpEvents = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error?.stack || error?.message || String(error)}`));
  page.on('response', (response) => { if (response.status() >= 400) httpEvents.push({ status: response.status(), url: response.url().replace(/\?.*$/, '') }); });

  let response = null;
  let verification = {
    ok: false,
    appText: '',
    restrictedSettingsNotice: false,
    restrictedReportsNotice: false,
    restrictedEditors: -1,
  };
  let error = null;
  try {
    const task = (async () => {
      response = await page.goto(`${publicOrigin}${route}?audit=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      verification = await inspectPaintPage(page, key, terms);
    })();
    const bounded = await Promise.race([task.then(() => true), delay(25000, false)]);
    if (!bounded) error = 'Page audit exceeded 25 seconds';
  } catch (failure) {
    error = failure?.message || String(failure);
  }

  const routeHttp = relevantHttp(httpEvents);
  const errors = relevantErrors(consoleErrors);
  const headers = response?.headers?.() || {};
  const branchOk = headers['x-axtor-frontend-branch'] === 'frontend-paint';
  const industryOk = headers['x-axtor-industry'] === 'paint';
  const isPaintSalesperson = expectedRole(user) === 'paint salesperson';
  const restrictedSettingsOk = !isPaintSalesperson || key !== 'settings'
    || (verification.restrictedSettingsNotice && verification.restrictedEditors === 0);
  const restrictedReportsOk = !isPaintSalesperson || key !== 'reports'
    || verification.restrictedReportsNotice;
  const ok = Boolean(response?.ok?.())
    && verification.ok
    && routeHttp.length === 0
    && errors.length === 0
    && branchOk
    && industryOk
    && restrictedSettingsOk
    && restrictedReportsOk
    && !error;

  if (user.key === 'owner' && key === 'dashboard') {
    await Promise.race([
      page.screenshot({ path: `${evidenceDir}/owner-dashboard.png`, fullPage: false }).catch(() => undefined),
      delay(8000),
    ]);
  }
  const finalUrl = page.url();
  await safeClose(page);
  return {
    key,
    route,
    ok,
    finalUrl,
    http: routeHttp,
    errors,
    branchOk,
    industryOk,
    restrictedSettingsOk,
    restrictedReportsOk,
    ...(error ? { error } : {}),
  };
}

async function probePaintSalesRestrictions(token) {
  const results = [];
  for (let index = 0; index < paintSalesRestrictions.length; index += 1) {
    const [name, method, path, body] = paintSalesRestrictions[index];
    let status = 0;
    let message = null;
    try {
      const response = await fetch(`${backendOrigin}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json', 'Idempotency-Key': `paint-browser-deny:${businessSlug}:${index}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
      status = response.status;
      const payload = await response.json().catch(() => null);
      message = typeof payload?.error === 'string' ? payload.error : payload?.error?.message || payload?.message || null;
    } catch (error) {
      message = error?.message || String(error);
    }
    const result = { name, method, path, expected: 403, actual: status, pass: status === 403, response: message };
    results.push(result);
    console.log('Paint Salesperson permission probe', { name, status, pass: result.pass });
  }
  return results;
}

const roleOrder = new Map([['cashier1', 1], ['cashier2', 2], ['van', 3], ['manager', 4], ['owner', 5]]);
const auditUsers = [...(runtime.users || [])].sort((a, b) => (roleOrder.get(a.key) || 99) - (roleOrder.get(b.key) || 99));
if (auditUsers.length !== 5) throw new Error(`Paint browser certification requires exactly five users, received ${auditUsers.length}`);

const browser = await chromium.launch({ headless: true, timeout: 30000 });
const results = [];
try {
  for (const user of auditUsers) {
    const session = await authenticate(user);
    const roleOk = observedRoles(session.user).includes(expectedRole(user));
    const businessOk = String(session.business?.slug || '').toLowerCase() === String(businessSlug).toLowerCase();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    await context.addInitScript(({ token, sessionUser, business }) => {
      localStorage.setItem('axtorAuthToken', token);
      localStorage.setItem('currentUser', JSON.stringify(sessionUser));
      localStorage.setItem('axtorCurrentUser', JSON.stringify(sessionUser));
      localStorage.setItem('axtorBusiness', JSON.stringify(business));
      sessionStorage.removeItem('axtorAuthReturnUrl');
      sessionStorage.removeItem('axtorAuthRedirectInProgress');
    }, { token: session.token, sessionUser: session.user, business: session.business });

    const pageResults = [];
    let permissionChecks = [];
    try {
      for (const [key, route, terms] of pages) {
        const entry = await auditPage(context, user, key, route, terms);
        pageResults.push(entry);
        console.log('Paint browser page', { user: user.key, role: user.role, key, ok: entry.ok, http: entry.http });
        await persistProgress(results, { user: user.key, role: user.role, pages: pageResults });
      }
      if (expectedRole(user) === 'paint salesperson') permissionChecks = await probePaintSalesRestrictions(session.token);
    } finally {
      await safeClose(context);
    }

    const restrictionsOk = expectedRole(user) !== 'paint salesperson'
      || (permissionChecks.length === paintSalesRestrictions.length && permissionChecks.every((entry) => entry.pass));
    const userResult = {
      key: user.key,
      role: user.role,
      loginOk: Boolean(session.token) && businessOk,
      roleOk,
      pages: pageResults,
      permissionChecks,
      pass: Boolean(session.token)
        && businessOk
        && roleOk
        && pageResults.length === pages.length
        && pageResults.every((entry) => entry.ok)
        && restrictionsOk,
    };
    results.push(userResult);
    await persistProgress(results);
  }
} finally {
  await Promise.race([browser.close().catch(() => undefined), delay(10000)]);
}

const paintSalesResult = results.find((item) => expectedRole(item) === 'paint salesperson');
report.browser = {
  users: results,
  checks: {
    fiveIndependentUsers: results.length === 5,
    allLoginsPass: results.every((item) => item.loginOk),
    allRolesPass: results.every((item) => item.roleOk),
    allRolesCheckedEveryPage: results.every((item) => item.pages.length === pages.length),
    dedicatedPaintPagesPass: results.every((item) => item.pages.every((entry) => entry.ok)),
    noUnexpectedPageHttpFailures: results.every((item) => item.pages.every((entry) => entry.http.length === 0)),
    paintSalesRestrictedSettingsPass: Boolean(paintSalesResult)
      && paintSalesResult.pages.some((entry) => entry.key === 'settings' && entry.restrictedSettingsOk),
    paintSalesRestrictedReportsPass: Boolean(paintSalesResult)
      && paintSalesResult.pages.some((entry) => entry.key === 'reports' && entry.restrictedReportsOk),
    paintSalesWriteRestrictionsPass: Boolean(paintSalesResult)
      && paintSalesResult.permissionChecks.length === paintSalesRestrictions.length
      && paintSalesResult.permissionChecks.every((entry) => entry.pass),
    noUnexpectedBrowserErrors: results.every((item) => item.pages.every((entry) => entry.errors.length === 0)),
  },
};
delete report.browserProgress;
report.overall = report.overall === 'PASS' && Object.values(report.browser.checks).every(Boolean) ? 'PASS' : 'FAIL';
await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
clearTimeout(hardTimer);
console.log(JSON.stringify(report.browser, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
