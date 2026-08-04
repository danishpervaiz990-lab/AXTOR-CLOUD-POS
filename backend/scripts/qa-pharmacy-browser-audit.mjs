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
  ['billing', '/apps/pharmacy/pharmacy-billing.html', []],
  ['reports', '/apps/pharmacy/pharmacy-reports.html', ['Reports']],
];

function isPharmacyCashier(user) {
  return ['cashier', 'pharmacy cashier'].includes(String(user?.role || '').trim().toLowerCase());
}

function cleanErrors(errors, user) {
  const restrictedRole = isPharmacyCashier(user);
  return errors.filter((message) => {
    if (/^(?:console|http):.*(?:favicon|Failed to load resource.*404)/i.test(message)) return false;
    if (/^console:.*ERR_ABORTED/i.test(message)) return false;
    if (restrictedRole && /^http 403: .*\/api\/v1\/(?:industry\/(?:records|batches)|suppliers)(?:\?|$)/i.test(message)) return false;
    if (restrictedRole && /^console:.*Failed to load resource: the server responded with a status of 403/i.test(message)) return false;
    return true;
  });
}

async function verifyPage(page, key, required, user) {
  if (key === 'billing') {
    await page.waitForFunction(() => {
      const heading = String(document.querySelector('.rx-hero h2')?.textContent || '').trim();
      const rows = document.querySelectorAll('#pharmacyContent .rx-table tbody tr').length;
      return /pharmacy billing/i.test(heading) && rows > 0;
    }, null, { timeout: 45000 }).catch(() => null);
    const state = await page.evaluate(() => ({
      heading: String(document.querySelector('.rx-hero h2')?.textContent || '').trim(),
      rows: document.querySelectorAll('#pharmacyContent .rx-table tbody tr').length,
      errorVisible: !document.querySelector('#pharmacyError')?.hidden,
    }));
    return {
      ok: /pharmacy billing/i.test(state.heading) && state.rows > 0 && !state.errorVisible,
      restricted: false,
      dataRows: state.rows,
    };
  }

  if (key === 'suppliers' && isPharmacyCashier(user)) {
    await page.waitForFunction(() => {
      const body = String(document.body?.innerText || '').toLowerCase();
      return body.includes('suppliers') && !/loading pharmacy|loading…|saving…/i.test(body);
    }, null, { timeout: 45000 }).catch(() => null);
    const state = await page.evaluate(() => {
      const body = String(document.body?.innerText || '');
      const rows = [...document.querySelectorAll('#pharmacyContent .rx-table tbody tr')];
      const dataRows = rows.filter((row) => row.querySelectorAll('td').length > 1).length;
      return {
        body,
        dataRows,
        errorVisible: !document.querySelector('#pharmacyError')?.hidden,
      };
    });
    return {
      ok: /suppliers/i.test(state.body) && state.dataRows === 0 && !/page not found|404/i.test(state.body),
      restricted: true,
      dataRows: state.dataRows,
      restrictionMessageVisible: state.errorVisible,
    };
  }

  await page.waitForFunction((terms) => {
    const body = String(document.body?.innerText || '').toLowerCase();
    const loading = /loading pharmacy|loading…|saving…/i.test(body);
    return !loading && terms.every((term) => body.includes(String(term).toLowerCase()));
  }, required, { timeout: 45000 }).catch(() => null);
  const body = await page.locator('body').innerText().catch(() => '');
  return {
    ok: required.every((term) => body.toLowerCase().includes(term.toLowerCase())) && !/page not found|404/i.test(body),
    restricted: false,
  };
}

const roleOrder = new Map([['cashier1', 1], ['cashier2', 2], ['van', 3], ['manager', 4], ['owner', 5]]);
const auditUsers = [...runtime.users].sort((a, b) => (roleOrder.get(a.key) || 99) - (roleOrder.get(b.key) || 99));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const user of auditUsers) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`); });

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
      await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);
      await page.waitForFunction(() => Boolean(localStorage.getItem('axtorAuthToken')), null, { timeout: 30000 });
      const storage = await context.storageState();
      const originState = storage.origins.find((entry) => entry.origin === runtime.publicOrigin);
      const values = Object.fromEntries((originState?.localStorage || []).map((entry) => [entry.name, entry.value]));
      const session = {
        token: values.axtorAuthToken || '',
        user: JSON.parse(values.currentUser || '{}'),
        business: JSON.parse(values.axtorBusiness || '{}'),
      };
      loginOk = Boolean(session.token) && String(session.business?.slug || '').toLowerCase() === String(runtime.ids.businessSlug || report.environment.businessSlug).toLowerCase();
      roleOk = Array.isArray(session.user?.roles) && session.user.roles.some((role) => String(role).toLowerCase() === String(user.role).toLowerCase());

      for (const [key, route, required] of pages) {
        let verification = { ok: false, restricted: false };
        let finalUrl = '';
        let lastError = '';
        for (let attempt = 1; attempt <= 3 && !verification.ok; attempt += 1) {
          try {
            await page.goto(`${runtime.publicOrigin}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
            verification = await verifyPage(page, key, required, user);
            finalUrl = page.url();
          } catch (error) {
            lastError = error?.message || String(error) || 'unknown navigation error';
            finalUrl = page.url();
          }
          if (!verification.ok && attempt < 3) await page.waitForTimeout(1500 * attempt);
        }
        if (!verification.ok && lastError) errors.push(`route ${key}: ${lastError}`);
        pageResults.push({
          key,
          route,
          ok: verification.ok,
          finalUrl,
          restricted: Boolean(verification.restricted),
          ...(Number.isFinite(verification.dataRows) ? { dataRows: verification.dataRows } : {}),
          ...(verification.restrictionMessageVisible !== undefined ? { restrictionMessageVisible: verification.restrictionMessageVisible } : {}),
          ...(lastError && !verification.ok ? { error: lastError } : {}),
        });
        if (user.key === 'owner') await page.screenshot({ path: `${evidenceDir}/owner-${key}.png`, fullPage: true }).catch(() => null);
      }
    } catch (error) {
      errors.push(`audit: ${error?.message || String(error) || 'unknown browser audit error'}`);
    }

    const relevantErrors = cleanErrors(errors, user);
    const allPagesChecked = pageResults.length === pages.length;
    results.push({
      key: user.key,
      role: user.role,
      loginOk,
      roleOk,
      pages: pageResults,
      errors: relevantErrors,
      pass: loginOk && roleOk && allPagesChecked && pageResults.every((entry) => entry.ok) && relevantErrors.length === 0,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const cashierResults = results.filter((item) => isPharmacyCashier(item));
report.browser = {
  users: results,
  checks: {
    fiveIndependentUsers: results.length === 5,
    allLoginsPass: results.every((item) => item.loginOk),
    allRolesPass: results.every((item) => item.roleOk),
    allRolesCheckedEveryPage: results.every((item) => item.pages.length === pages.length),
    dedicatedPharmacyPagesPass: results.every((item) => item.pages.length === pages.length && item.pages.every((entry) => entry.ok)),
    cashierSupplierRestrictionPass: cashierResults.length === 2 && cashierResults.every((item) => {
      const supplierPage = item.pages.find((page) => page.key === 'suppliers');
      return supplierPage?.ok === true && supplierPage?.restricted === true && supplierPage?.dataRows === 0;
    }),
    expectedRoleRestrictionsPass: cashierResults.every((item) => item.errors.length === 0),
    noUnexpectedBrowserErrors: results.every((item) => item.errors.length === 0),
  },
};
report.overall = Object.values(report.browser.checks).every(Boolean) && report.overall === 'PASS' ? 'PASS' : 'FAIL';
await fs.writeFile('pharmacy-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.browser, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
