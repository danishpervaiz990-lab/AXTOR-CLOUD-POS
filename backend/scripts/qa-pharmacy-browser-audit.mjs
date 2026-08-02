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

function cleanErrors(errors, user) {
  const restrictedRole = ['cashier', 'salesman'].includes(String(user.role || '').toLowerCase());
  return errors.filter((message) => {
    if (/favicon|ERR_ABORTED|Failed to load resource.*404/i.test(message)) return false;
    if (restrictedRole && /(?:http 403: .*\/api\/v1\/industry\/(?:records|batches)|Failed to load resource: the server responded with a status of 403)/i.test(message)) return false;
    return true;
  });
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const user of runtime.users) {
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
      await page.goto(`${runtime.publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('#businessSlug').fill(runtime.ids.businessSlug || report.environment.businessSlug);
      await page.locator('#loginEmail').fill(user.email);
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
        await page.goto(`${runtime.publicOrigin}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        let ok = false;
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
          ok = /pharmacy billing/i.test(state.heading) && state.rows > 0 && !state.errorVisible;
        } else {
          await page.waitForFunction((terms) => {
            const body = String(document.body?.innerText || '').toLowerCase();
            const loading = /loading pharmacy|loading…|saving…/i.test(body);
            return !loading && terms.every((term) => body.includes(String(term).toLowerCase()));
          }, required, { timeout: 45000 }).catch(() => null);
          const body = await page.locator('body').innerText().catch(() => '');
          ok = required.every((term) => body.toLowerCase().includes(term.toLowerCase())) && !/page not found|404/i.test(body);
        }
        pageResults.push({ key, route, ok, finalUrl: page.url() });
        if (user.key === 'owner') await page.screenshot({ path: `${evidenceDir}/owner-${key}.png`, fullPage: true });
      }
    } catch (error) {
      errors.push(`audit: ${error.message}`);
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

report.browser = {
  users: results,
  checks: {
    fiveIndependentUsers: results.length === 5,
    allLoginsPass: results.every((item) => item.loginOk),
    allRolesPass: results.every((item) => item.roleOk),
    allRolesCheckedEveryPage: results.every((item) => item.pages.length === pages.length),
    dedicatedPharmacyPagesPass: results.every((item) => item.pages.length === pages.length && item.pages.every((entry) => entry.ok)),
    expectedRoleRestrictionsPass: results.filter((item) => ['Cashier', 'Salesman'].includes(item.role)).every((item) => item.errors.length === 0),
    noUnexpectedBrowserErrors: results.every((item) => item.errors.length === 0),
  },
};
report.overall = Object.values(report.browser.checks).every(Boolean) && report.overall === 'PASS' ? 'PASS' : 'FAIL';
await fs.writeFile('pharmacy-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.browser, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
