import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { prepareLoginIdentity, request, unwrap } from './qa-grocery-live-helpers.mjs';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const runtime = JSON.parse(await fs.readFile('grocery-live-runtime.json', 'utf8'));
const evidenceDir = 'grocery-live-evidence';
await fs.mkdir(evidenceDir, { recursive: true });
const results = [];

function rows(value) {
  const data = unwrap(value);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}
function meaningful(errors) {
  return errors.filter((message) => !/favicon|robots\.txt|ERR_ABORTED|chrome-extension|Failed to load resource.*404/i.test(message));
}
function attach(page, errors) {
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`); });
}

async function waitForRouteReady(page, route) {
  await page.locator('.g-shell').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#app').waitFor({ state: 'visible', timeout: 20000 });
  if (route === 'grocery-dashboard.html') {
    await page.locator('#gDashboardStatus.g-status.ok').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#gTopProducts').waitFor({ state: 'visible', timeout: 10000 });
    return;
  }
  if (route === 'grocery-reports.html') {
    await page.locator('#gFinanceReports').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#gfStatus.g-status.ok').waitFor({ state: 'visible', timeout: 30000 });
    return;
  }
  await page.waitForTimeout(1500);
}

const documents = rows((await request(runtime.backendOrigin, '/api/v1/sales-documents?documentType=invoice&limit=250', { token: runtime.token, expected: [200] })).payload)
  .filter((document) => String(document.referenceNo || '').startsWith(`QA-${runtime.runTag}-`));
const selected = [documents[0], documents[49], documents[99]].filter(Boolean);

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const loginErrors = [];
  const loginPage = await context.newPage();
  attach(loginPage, loginErrors);
  try {
    await loginPage.goto(`${runtime.publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await prepareLoginIdentity(loginPage, runtime.email, runtime.businessSlug);
    await loginPage.locator('#loginPassword').fill(runtime.password);
    await Promise.all([
      loginPage.locator('#loginButton').click(),
      loginPage.waitForFunction(() => Boolean(localStorage.getItem('axtorAuthToken')), null, { timeout: 30000 }),
    ]);
    await loginPage.waitForTimeout(900);
    const state = await context.storageState();
    const origin = state.origins.find((entry) => entry.origin === runtime.publicOrigin);
    const tokenStored = Boolean((origin?.localStorage || []).find((entry) => entry.name === 'axtorAuthToken' && entry.value));
    const me = await request(runtime.backendOrigin, '/api/v1/auth/me', { token: runtime.token, expected: [200] });
    const tenantResolved = String(me.data?.business?.slug || '').toLowerCase() === String(runtime.businessSlug).toLowerCase();
    const observedRoles = [me.data?.user?.role, ...(Array.isArray(me.data?.user?.roles) ? me.data.user.roles : [])].filter(Boolean);
    results.push({
      name: 'Owner login through live UI',
      pass: tokenStored && tenantResolved && observedRoles.some((role) => /owner/i.test(String(role))) && meaningful(loginErrors).length === 0,
      tokenStored,
      tenantResolved,
      observedRoles,
      finalUrl: loginPage.url(),
      errors: meaningful(loginErrors),
    });
  } catch (error) {
    results.push({ name: 'Owner login through live UI', pass: false, error: error.message, errors: meaningful(loginErrors) });
  } finally {
    await loginPage.close();
  }

  const routes = [
    ['dashboard', 'grocery-dashboard.html', /operations dashboard/i],
    ['terminal', 'grocery-terminal.html', /checkout|terminal/i],
    ['products', 'grocery-products.html', /product|plu/i],
    ['batches', 'grocery-batches.html', /batch/i],
    ['expiry', 'grocery-expiry.html', /expiry/i],
    ['receiving', 'grocery-receiving.html', /receiv/i],
    ['waste', 'grocery-waste.html', /waste|spoilage/i],
    ['recalls', 'grocery-recalls.html', /recall/i],
    ['reports', 'grocery-reports.html', /report/i],
    ['settings', 'grocery-settings.html', /setting/i],
  ];
  for (const [name, route, titlePattern] of routes) {
    const page = await context.newPage();
    const errors = [];
    attach(page, errors);
    try {
      await page.goto(`${runtime.publicOrigin}/apps/grocery/${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitForRouteReady(page, route);
      const finalUrl = new URL(page.url());
      const title = String(await page.locator('.g-hero h1').innerText().catch(() => '')).trim();
      const body = String(await page.locator('body').innerText().catch(() => '')).trim();
      const statusErrors = await page.locator('.g-status.error').allInnerTexts().catch(() => []);
      const filteredErrors = meaningful(errors);
      const pass = finalUrl.pathname === `/apps/grocery/${route}`
        && titlePattern.test(title)
        && !/page not found|authentication required|permission denied|unauthorized|forbidden/i.test(body)
        && statusErrors.length === 0
        && filteredErrors.length === 0;
      await page.screenshot({ path: `${evidenceDir}/${name}.png`, fullPage: true }).catch(() => undefined);
      results.push({ name: `Authenticated ${name}`, pass, title, finalUrl: page.url(), statusErrors, errors: filteredErrors });
    } catch (error) {
      await page.screenshot({ path: `${evidenceDir}/${name}-failure.png`, fullPage: true }).catch(() => undefined);
      results.push({ name: `Authenticated ${name}`, pass: false, error: error.message, errors: meaningful(errors) });
    } finally {
      await page.close();
    }
  }

  for (const [index, profile] of ['a4', 'thermal-80', 'thermal-58'].entries()) {
    const document = selected[index] || selected[0];
    if (!document) {
      results.push({ name: `Print profile ${profile}`, pass: false, error: 'No QA invoice available' });
      continue;
    }
    const page = await context.newPage();
    const errors = [];
    attach(page, errors);
    try {
      const url = `${runtime.publicOrigin}/apps/grocery/invoice-view.html?id=${encodeURIComponent(document.id)}&profile=${encodeURIComponent(profile)}&print=0`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction(
        (documentNo) => document.body.dataset.groceryDocumentReady === 'true'
          && String(document.querySelector('#invoiceViewRoot')?.textContent || '').includes(documentNo),
        document.documentNo,
        { timeout: 30000 },
      );
      const body = String(await page.locator('body').innerText({ timeout: 10000 }).catch(() => '')).trim();
      const filteredErrors = meaningful(errors);
      const selectedProfile = await page.locator('#invoiceViewProfile').inputValue().catch(() => '');
      const pass = body.includes(document.documentNo)
        && selectedProfile === profile
        && !/document not found|no saved document was selected|page not found|authentication required|module ready/i.test(body)
        && filteredErrors.length === 0;
      await page.screenshot({ path: `${evidenceDir}/print-${profile}.png`, fullPage: true }).catch(() => undefined);
      results.push({ name: `Print profile ${profile}`, pass, documentNo: document.documentNo, selectedProfile, finalUrl: page.url(), errors: filteredErrors });
    } catch (error) {
      await page.screenshot({ path: `${evidenceDir}/print-${profile}-failure.png`, fullPage: true }).catch(() => undefined);
      results.push({ name: `Print profile ${profile}`, pass: false, error: error.message, errors: meaningful(errors) });
    } finally {
      await page.close();
    }
  }
  await context.close();
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  tenant: { businessId: runtime.businessId, businessSlug: runtime.businessSlug },
  invoiceEvidenceCount: selected.length,
  results,
  overall: results.length === 14 && results.every((item) => item.pass) ? 'PASS' : 'FAIL',
};
await fs.writeFile('grocery-authenticated-browser-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
