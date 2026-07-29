import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const runtimePath = 'retail-live-audit-runtime.json';
const reportPath = 'retail-live-audit-report.json';
const runtime = JSON.parse(await fs.readFile(runtimePath, 'utf8'));
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const evidenceDir = 'retail-browser-evidence';
await fs.mkdir(evidenceDir, { recursive: true });

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
    let loginOk = false;
    let retailRouteOk = false;
    let sidebarOk = false;
    let roleOk = false;
    let tokenStored = false;
    let finalUrl = '';
    try {
      await page.goto(`${runtime.publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('#businessSlug').fill(runtime.ids.businessSlug || report.environment.businessSlug);
      await page.locator('#loginEmail').fill(user.email);
      await page.locator('#loginPassword').fill(user.password);
      await Promise.all([
        page.locator('#loginButton').click(),
        page.waitForFunction(() => Boolean(localStorage.getItem('axtorAuthToken')), null, { timeout: 30000 }),
      ]);
      const session = await page.evaluate(() => ({ token: localStorage.getItem('axtorAuthToken'), user: JSON.parse(localStorage.getItem('currentUser') || '{}'), business: JSON.parse(localStorage.getItem('axtorBusiness') || '{}') }));
      tokenStored = Boolean(session.token);
      roleOk = Array.isArray(session.user?.roles) && session.user.roles.some((role) => String(role).toLowerCase() === String(user.role).toLowerCase());
      loginOk = tokenStored && String(session.business?.slug || '').toLowerCase() === String(report.environment.businessSlug).toLowerCase();

      await page.goto(`${runtime.publicOrigin}/app/retail/retail-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);
      finalUrl = page.url();
      const body = await page.locator('body').innerText().catch(() => '');
      retailRouteOk = /retail/i.test(body) && !/page not found|404/i.test(body);
      sidebarOk = ['Terminal', 'Sales', 'Customers', 'Products', 'Inventory'].filter((label) => body.includes(label)).length >= 4;
      await page.screenshot({ path: `${evidenceDir}/${user.key}-retail-dashboard.png`, fullPage: true });
    } catch (error) {
      errors.push(`browser: ${error.message}`);
    }
    const filtered = cleanErrors(errors);
    const result = loginOk && roleOk && retailRouteOk && sidebarOk && filtered.length === 0 ? 'PASS' : 'FAIL';
    results.push({ user: user.label, role: user.role, freshContext: true, loginPage: loginOk, roleResolved: roleOk, tokenStored, dedicatedRetailRoute: retailRouteOk, retailSidebar: sidebarOk, finalUrl, consoleErrors: filtered, result });
    await context.close();
  }
} finally {
  await browser.close();
}

report.browserAudit = results;
const allPass = results.length === 5 && results.every((row) => row.result === 'PASS');
report.acceptance['Five-login browser test'] = { result: allPass ? 'PASS' : 'FAIL', detail: allPass ? 'All five users signed in through the actual login page in fresh browser contexts and loaded the dedicated Retail application' : 'One or more browser login/route/sidebar checks failed' };
for (const row of report.users) {
  const browserRow = results.find((item) => item.user === row.user);
  if (browserRow) row.browserLoginResult = browserRow.result;
}
if (!allPass) report.overall = 'FAIL';
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(`Browser audit completed: ${allPass ? 'PASS' : 'FAIL'} for ${results.length} accounts.`);
