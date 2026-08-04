import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const runtime = JSON.parse(await fs.readFile('hardware-live-audit-runtime.json', 'utf8'));
const report = JSON.parse(await fs.readFile('hardware-live-audit-report.json', 'utf8'));
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

function roleName(user) {
  return String(user?.role || '').trim().toLowerCase();
}

function expectedRestricted(user, key) {
  const role = roleName(user);
  if (role === 'owner') return false;
  if (role === 'hardware manager') return key === 'settings';
  if (role === 'trade salesperson') {
    return ['dashboard', 'deliveries', 'backorders', 'rentals', 'warranties', 'unit-conversions', 'reports', 'settings'].includes(key);
  }
  return true;
}

function cleanConsoleErrors(errors) {
  return errors.filter((message) => {
    if (/favicon|ERR_ABORTED|Failed to load resource: the server responded with a status of 403|Failed to load resource.*404/i.test(message)) return false;
    return true;
  });
}

async function inspectPage(page, key, terms, restricted) {
  await page.waitForFunction(({ terms }) => {
    const text = String(document.body?.innerText || '').toLowerCase();
    const heading = String(document.querySelector('h1')?.textContent || '').toLowerCase();
    return terms.every((term) => text.includes(String(term).toLowerCase()) || heading.includes(String(term).toLowerCase()));
  }, { terms }, { timeout: 45000 }).catch(() => null);

  return page.evaluate(({ key, terms, restricted }) => {
    const text = String(document.body?.innerText || '');
    const lower = text.toLowerCase();
    const heading = String(document.querySelector('h1')?.textContent || '').toLowerCase();
    const hasTerms = terms.every((term) => lower.includes(String(term).toLowerCase()) || heading.includes(String(term).toLowerCase()));
    const dataRows = [...document.querySelectorAll('#app table tbody tr')].filter((row) => row.querySelectorAll('td').length > 1 && !/no records|loading/i.test(row.textContent || '')).length;
    const appText = String(document.querySelector('#app')?.innerText || '').trim();
    const terminalReady = key !== 'terminal' || Boolean(document.querySelector('#checkoutForm'));
    const shellReady = Boolean(document.querySelector('#app')) && !/page not found|404/i.test(text);
    return {
      ok: hasTerms && shellReady && terminalReady,
      restricted,
      dataRows,
      appText,
      errorTextVisible: /permission|forbidden|not allowed|access denied|request failed/i.test(appText),
    };
  }, { key, terms, restricted });
}

const roleOrder = new Map([['cashier1', 1], ['cashier2', 2], ['van', 3], ['manager', 4], ['owner', 5]]);
const auditUsers = [...runtime.users].sort((a, b) => (roleOrder.get(a.key) || 99) - (roleOrder.get(b.key) || 99));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const user of auditUsers) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const consoleErrors = [];
    const httpEvents = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`); });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 400) httpEvents.push({ status: response.status(), url: response.url() });
    });

    let loginOk = false;
    let roleOk = false;
    const pageResults = [];
    try {
      const loginUrl = new URL('/login.html', runtime.publicOrigin);
      loginUrl.searchParams.set('email', user.email);
      await page.goto(loginUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('#loginEmail').fill(user.email);
      await page.waitForFunction((expectedEmail) => {
        const email = String(document.querySelector('#loginEmail')?.value || '').trim().toLowerCase();
        const workspace = String(document.querySelector('#businessSlug')?.value || '').trim().toLowerCase();
        return email === expectedEmail && workspace === expectedEmail;
      }, String(user.email).trim().toLowerCase(), { timeout: 10000 });
      await page.locator('#loginPassword').fill(user.password);
      await Promise.all([
        page.waitForURL((url) => !url.pathname.endsWith('/login.html'), { timeout: 30000 }).catch(() => null),
        page.locator('#loginButton').click(),
      ]);
      await page.waitForFunction(() => Boolean(localStorage.getItem('axtorAuthToken')), null, { timeout: 30000 });
      const storage = await context.storageState();
      const originState = storage.origins.find((entry) => entry.origin === runtime.publicOrigin);
      const values = Object.fromEntries((originState?.localStorage || []).map((entry) => [entry.name, entry.value]));
      const session = { token: values.axtorAuthToken || '', user: JSON.parse(values.currentUser || '{}'), business: JSON.parse(values.axtorBusiness || '{}') };
      loginOk = Boolean(session.token) && String(session.business?.slug || '').toLowerCase() === String(runtime.ids.businessSlug || report.environment.businessSlug).toLowerCase();
      roleOk = Array.isArray(session.user?.roles) && session.user.roles.some((role) => String(role).toLowerCase() === roleName(user));

      for (const [key, route, terms] of pages) {
        const restricted = expectedRestricted(user, key);
        let verification = { ok: false, restricted, dataRows: 0, appText: '', errorTextVisible: false };
        let finalUrl = '';
        let lastError = '';
        let routeHttp = [];
        for (let attempt = 1; attempt <= 3 && !verification.ok; attempt += 1) {
          const httpStart = httpEvents.length;
          try {
            await page.goto(`${runtime.publicOrigin}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
            verification = await inspectPage(page, key, terms, restricted);
            finalUrl = page.url();
            routeHttp = httpEvents.slice(httpStart);
            const has403 = routeHttp.some((event) => event.status === 403);
            const unexpectedHttp = routeHttp.filter((event) => event.status >= 400 && !(restricted && event.status === 403));
            if (restricted) {
              verification.ok = verification.ok && has403 && verification.dataRows === 0;
            } else {
              verification.ok = verification.ok && unexpectedHttp.length === 0 && !has403;
            }
          } catch (error) {
            lastError = error?.message || String(error) || 'unknown navigation error';
            finalUrl = page.url();
            routeHttp = httpEvents.slice(httpStart);
          }
          if (!verification.ok && attempt < 3) await page.waitForTimeout(1200 * attempt);
        }
        pageResults.push({
          key,
          route,
          ok: verification.ok,
          finalUrl,
          restricted,
          dataRows: verification.dataRows,
          errorTextVisible: verification.errorTextVisible,
          http: routeHttp,
          ...(lastError && !verification.ok ? { error: lastError } : {}),
        });
        if (user.key === 'owner') await page.screenshot({ path: `${evidenceDir}/owner-${key}.png`, fullPage: true }).catch(() => null);
      }
    } catch (error) {
      consoleErrors.push(`audit: ${error?.message || String(error) || 'unknown browser audit error'}`);
    }

    const relevantConsoleErrors = cleanConsoleErrors(consoleErrors);
    const allPagesChecked = pageResults.length === pages.length;
    results.push({
      key: user.key,
      role: user.role,
      loginOk,
      roleOk,
      pages: pageResults,
      errors: relevantConsoleErrors,
      pass: loginOk && roleOk && allPagesChecked && pageResults.every((entry) => entry.ok) && relevantConsoleErrors.length === 0,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const restrictedPages = results.flatMap((item) => item.pages.filter((page) => page.restricted));
report.browser = {
  users: results,
  checks: {
    fiveIndependentUsers: results.length === 5,
    allLoginsPass: results.every((item) => item.loginOk),
    allRolesPass: results.every((item) => item.roleOk),
    allRolesCheckedEveryPage: results.every((item) => item.pages.length === pages.length),
    dedicatedHardwarePagesPass: results.every((item) => item.pages.every((entry) => entry.ok)),
    restrictedPagesExposeNoRows: restrictedPages.length > 0 && restrictedPages.every((entry) => entry.dataRows === 0),
    expectedRoleRestrictionsPass: restrictedPages.every((entry) => entry.http.some((event) => event.status === 403)),
    noUnexpectedBrowserErrors: results.every((item) => item.errors.length === 0),
  },
};
report.overall = report.overall === 'PASS' && Object.values(report.browser.checks).every(Boolean) ? 'PASS' : 'FAIL';
await fs.writeFile('hardware-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.browser, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
