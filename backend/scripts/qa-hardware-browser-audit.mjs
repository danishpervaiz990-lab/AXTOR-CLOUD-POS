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

function cleanErrors(errors, user) {
  const restricted = ['cashier', 'salesman'].includes(String(user.role || '').toLowerCase());
  return errors.filter((message) => {
    if (/favicon|ERR_ABORTED|Failed to load resource.*404/i.test(message)) return false;
    if (restricted && /(?:http 403: .*\/api\/v1\/(?:hardware|settings)|Failed to load resource: the server responded with a status of 403)/i.test(message)) return false;
    return true;
  });
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
      await page.locator('#loginButton').click();
      await page.waitForFunction(() => Boolean(localStorage.getItem('axtorAuthToken')), null, { timeout: 30000 });
      await page.waitForTimeout(750);
      const storage = await context.storageState();
      const originState = storage.origins.find((entry) => entry.origin === runtime.publicOrigin);
      const values = Object.fromEntries((originState?.localStorage || []).map((entry) => [entry.name, entry.value]));
      const session = { token: values.axtorAuthToken || '', user: JSON.parse(values.currentUser || '{}'), business: JSON.parse(values.axtorBusiness || '{}') };
      loginOk = Boolean(session.token) && String(session.business?.slug || '').toLowerCase() === String(runtime.ids.businessSlug || report.environment.businessSlug).toLowerCase();
      roleOk = Array.isArray(session.user?.roles) && session.user.roles.some((role) => String(role).toLowerCase() === String(user.role).toLowerCase());

      for (const [key, route, terms] of pages) {
        await page.goto(`${runtime.publicOrigin}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(1200);
        const structural = await page.evaluate(({ key, terms }) => {
          const text = String(document.body?.innerText || '').toLowerCase();
          const heading = String(document.querySelector('h1')?.textContent || '').toLowerCase();
          const hasTerms = terms.every((term) => text.includes(String(term).toLowerCase()) || heading.includes(String(term).toLowerCase()));
          if (key === 'settings') return hasTerms && Boolean(document.querySelector('#app'));
          if (key === 'terminal') return hasTerms && Boolean(document.querySelector('#checkoutForm'));
          return hasTerms && !/page not found|404/i.test(text);
        }, { key, terms });
        pageResults.push({ key, route, ok: structural, finalUrl: page.url() });
        if (user.key === 'owner') await page.screenshot({ path: `${evidenceDir}/owner-${key}.png`, fullPage: true });
      }
    } catch (error) {
      errors.push(`audit: ${error.message}`);
    }
    const relevantErrors = cleanErrors(errors, user);
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
    dedicatedHardwarePagesPass: results.every((item) => item.pages.every((entry) => entry.ok)),
    settingsPagePass: results.every((item) => item.pages.find((entry) => entry.key === 'settings')?.ok),
    noUnexpectedBrowserErrors: results.every((item) => item.errors.length === 0),
  },
};
report.overall = report.overall === 'PASS' && Object.values(report.browser.checks).every(Boolean) ? 'PASS' : 'FAIL';
await fs.writeFile('hardware-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.browser, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
