import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const runtime = JSON.parse(await fs.readFile('clinic-live-audit-runtime.json', 'utf8'));
const report = JSON.parse(await fs.readFile('clinic-live-audit-report.json', 'utf8'));
const evidenceDir = 'clinic-browser-evidence';
await fs.mkdir(evidenceDir, { recursive: true });

const pages = [
  ['dashboard', '/clinic-dashboard.html', ['Clinic Dashboard']],
  ['patients', '/clinic-patients.html', ['Patients']],
  ['practitioners', '/clinic-practitioners.html', ['Practitioners']],
  ['appointments', '/clinic-appointments.html', ['Appointments']],
  ['calendar', '/clinic-appointment-calendar.html', ['Appointment Calendar']],
  ['queue', '/clinic-queue.html', ['Queue']],
  ['encounters', '/clinic-encounters.html', ['Encounters']],
  ['services', '/clinic-services.html', ['Clinic Services']],
  ['billing', '/clinic-billing.html', ['Service Billing']],
  ['invoices', '/clinic-invoices.html', ['Clinic Invoices']],
  ['payments', '/clinic-payments.html', ['Clinic Payments']],
  ['follow-ups', '/clinic-follow-ups.html', ['Follow-ups']],
  ['reports', '/clinic-reports.html', ['Clinic Reports']],
  ['settings', '/clinic-settings.html', ['Clinic Settings']],
];

function filterExpectedErrors(errors, user) {
  const restricted = ['Receptionist', 'Doctor', 'Nurse', 'Cashier'].includes(user.role);
  return errors.filter((message) => {
    if (/favicon|ERR_ABORTED|Failed to load resource.*404/i.test(message)) return false;
    if (restricted && /(?:http 403: .*\/api\/v1\/clinic\/|Failed to load resource: the server responded with a status of 403)/i.test(message)) return false;
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
    let clinicLandingOk = false;
    let roleOk = false;
    let logoutOk = false;
    const pageResults = [];

    try {
      await page.goto(`${runtime.publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.locator('#businessSlug').fill(runtime.ids.businessSlug);
      await page.locator('#loginEmail').fill(user.email);
      await page.locator('#loginPassword').fill(user.password);
      await page.locator('#loginButton').click();
      await page.waitForFunction(() => Boolean(localStorage.getItem('axtorAuthToken')), null, { timeout: 30000 });
      await page.waitForTimeout(1000);

      const session = await page.evaluate(() => ({
        token: localStorage.getItem('axtorAuthToken') || '',
        user: JSON.parse(localStorage.getItem('currentUser') || '{}'),
        business: JSON.parse(localStorage.getItem('axtorBusiness') || '{}'),
      }));
      loginOk = Boolean(session.token) && String(session.business?.slug || '').toLowerCase() === runtime.ids.businessSlug.toLowerCase();
      const roles = session.user?.roles || [];
      roleOk = Array.isArray(roles)
        ? roles.some((role) => String(role?.name || role).toLowerCase().includes(user.role.toLowerCase()))
        : String(roles || '').toLowerCase().includes(user.role.toLowerCase());

      await page.goto(`${runtime.publicOrigin}/clinic-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction(() => /clinic dashboard/i.test(document.body?.innerText || ''), null, { timeout: 30000 }).catch(() => null);
      clinicLandingOk = /clinic dashboard/i.test(await page.locator('body').innerText().catch(() => ''));

      for (const [key, route, required] of pages) {
        await page.goto(`${runtime.publicOrigin}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForFunction((terms) => {
          const text = String(document.body?.innerText || '').toLowerCase();
          const loading = /loading clinic|loading…|saving…/i.test(text);
          return !loading && terms.every((term) => text.includes(String(term).toLowerCase()));
        }, required, { timeout: 45000 }).catch(() => null);
        const state = await page.evaluate((terms) => {
          const text = String(document.body?.innerText || '');
          return {
            text,
            ok: terms.every((term) => text.toLowerCase().includes(String(term).toLowerCase())),
            hasError: !document.querySelector('#clinicError')?.hidden,
            hasGenericIndustryLink: Boolean(document.querySelector('a[href*="industry.html?module="]')),
          };
        }, required);
        const ok = state.ok && !state.hasError && !state.hasGenericIndustryLink && !/page not found|404/i.test(state.text);
        pageResults.push({ key, route, ok, finalUrl: page.url() });
        if (user.key === 'owner') await page.screenshot({ path: `${evidenceDir}/owner-${key}.png`, fullPage: true });
      }

      await page.goto(`${runtime.publicOrigin}/clinic-settings.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const saveButtons = await page.locator('button[type="submit"]').count();
      const settingsPermissionOk = user.key === 'owner' ? saveButtons > 0 : true;
      pageResults.push({ key: 'settings-permission', route: '/clinic-settings.html', ok: settingsPermissionOk, finalUrl: page.url() });

      await page.locator('#clinicLogout').click().catch(() => null);
      await page.waitForTimeout(750);
      logoutOk = await page.evaluate(() => !localStorage.getItem('axtorAuthToken'));
    } catch (error) {
      errors.push(`audit: ${error.message}`);
    }

    const relevantErrors = filterExpectedErrors(errors, user);
    results.push({
      key: user.key,
      role: user.role,
      loginOk,
      roleOk,
      clinicLandingOk,
      logoutOk,
      pages: pageResults,
      errors: relevantErrors,
      pass: loginOk && roleOk && clinicLandingOk && logoutOk && pageResults.every((entry) => entry.ok) && relevantErrors.length === 0,
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
    allClinicLandingsPass: results.every((item) => item.clinicLandingOk),
    dedicatedClinicPagesPass: results.every((item) => item.pages.every((entry) => entry.ok)),
    logoutPass: results.every((item) => item.logoutOk),
    noUnexpectedBrowserErrors: results.every((item) => item.errors.length === 0),
  },
};
report.overall = report.overall === 'PASS' && Object.values(report.browser.checks).every(Boolean) ? 'PASS' : 'FAIL';
await fs.writeFile('clinic-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.browser, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
