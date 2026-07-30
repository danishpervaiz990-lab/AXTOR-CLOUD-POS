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
  ['billing', '/apps/pharmacy/pharmacy-billing.html', ['Billing']],
  ['reports', '/apps/pharmacy/pharmacy-reports.html', ['Reports']],
];

function cleanErrors(errors) {
  return errors.filter((message) => !/favicon|ERR_ABORTED|Failed to load resource.*404/i.test(message));
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const user of runtime.users) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
        page.locator('#loginButton').click(),
        page.waitForFunction(() => Boolean(localStorage.getItem('axtorAuthToken')), null, { timeout: 30000 }),
      ]);
      const session = await page.evaluate(() => ({
        token: localStorage.getItem('axtorAuthToken') || '',
        user: JSON.parse(localStorage.getItem('currentUser') || '{}'),
        business: JSON.parse(localStorage.getItem('axtorBusiness') || '{}'),
      }));
      loginOk = Boolean(session.token) && String(session.business?.slug || '').toLowerCase() === String(runtime.ids.businessSlug || report.environment.businessSlug).toLowerCase();
      roleOk = Array.isArray(session.user?.roles) && session.user.roles.some((role) => String(role).toLowerCase() === String(user.role).toLowerCase());

      for (const [key, route, required] of pages) {
        await page.goto(`${runtime.publicOrigin}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(1800);
        const body = await page.locator('body').innerText().catch(() => '');
        const ok = required.every((term) => body.toLowerCase().includes(term.toLowerCase())) && !/page not found|404/i.test(body);
        pageResults.push({ key, route, ok, finalUrl: page.url() });
        if (user.key === 'owner') await page.screenshot({ path: `${evidenceDir}/owner-${key}.png`, fullPage: true });
      }
    } catch (error) {
      errors.push(`audit: ${error.message}`);
    }

    const relevantErrors = cleanErrors(errors);
    results.push({ key: user.key, role: user.role, loginOk, roleOk, pages: pageResults, errors: relevantErrors, pass: loginOk && roleOk && pageResults.every((entry) => entry.ok) && relevantErrors.length === 0 });
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
    dedicatedPharmacyPagesPass: results.every((item) => item.pages.every((entry) => entry.ok)),
    noBrowserErrors: results.every((item) => item.errors.length === 0),
  },
};
report.overall = Object.values(report.browser.checks).every(Boolean) && report.overall === 'PASS' ? 'PASS' : 'FAIL';
await fs.writeFile('pharmacy-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.browser, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
