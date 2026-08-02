import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const runtime = JSON.parse(await fs.readFile('grocery-live-runtime.json', 'utf8'));
const evidenceDir = 'grocery-live-evidence';
await fs.mkdir(evidenceDir, { recursive: true });
const results = [];
const errors = [];

async function api(path) {
  const response = await fetch(`${runtime.backendOrigin || 'https://axtor-cloud-pos-production.up.railway.app'}${path}`, { headers: { Authorization: `Bearer ${runtime.token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `${path} returned ${response.status}`);
  return body?.data ?? body;
}

const docsBody = await api('/api/v1/sales-documents?documentType=invoice&limit=250');
const docs = Array.isArray(docsBody) ? docsBody : docsBody?.data || [];
const qaDocs = docs.filter(doc => String(doc.referenceNo || '').startsWith(`QA-${runtime.runTag}-`)).reverse();
const selected = [qaDocs[0], qaDocs[49], qaDocs[99]].filter(Boolean);

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('response', response => { if (response.status() >= 500) errors.push(`http ${response.status()}: ${response.url()}`); });

  await page.goto(`${runtime.publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#businessSlug').fill(runtime.businessSlug);
  await page.locator('#loginEmail').fill(runtime.email);
  await page.locator('#loginPassword').fill(runtime.password);
  await Promise.all([
    page.waitForURL(url => !url.pathname.endsWith('/login.html'), { timeout: 30000 }).catch(() => null),
    page.locator('#loginButton').click(),
  ]);
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(1000);
  const storage = await context.storageState();
  const tokenStored = storage.origins.some(origin => origin.localStorage.some(item => item.name === 'axtorAuthToken' && Boolean(item.value)));
  results.push({ name: 'Owner login through live UI', pass: tokenStored, finalUrl: page.url() });

  const routes = [
    ['dashboard','grocery-dashboard.html'], ['terminal','grocery-terminal.html'], ['products','grocery-products.html'],
    ['batches','grocery-batches.html'], ['expiry','grocery-expiry.html'], ['receiving','grocery-receiving.html'],
    ['waste','grocery-waste.html'], ['recalls','grocery-recalls.html'], ['reports','grocery-reports.html'], ['settings','grocery-settings.html'],
  ];
  for (const [name, route] of routes) {
    try {
      await page.goto(`${runtime.publicOrigin}/apps/grocery/${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1200);
      const body = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
      const pass = !/404|page not found|authentication required/i.test(body) && /grocery|sales|product|inventory|report|setting|batch|expiry/i.test(body);
      await page.screenshot({ path: `${evidenceDir}/${name}.png`, fullPage: true }).catch(() => null);
      results.push({ name: `Authenticated ${name}`, pass, finalUrl: page.url(), sample: body.slice(0, 250) });
    } catch (error) {
      results.push({ name: `Authenticated ${name}`, pass: false, error: error.message });
    }
  }

  for (const profile of ['a4','thermal-80','thermal-58']) {
    const doc = selected[profile === 'a4' ? 0 : profile === 'thermal-80' ? 1 : 2] || selected[0];
    if (!doc) { results.push({ name: `Print profile ${profile}`, pass: false, error: 'No QA invoice available' }); continue; }
    try {
      const url = `${runtime.publicOrigin}/apps/grocery/invoice-view.html?id=${encodeURIComponent(doc.id)}&profile=${encodeURIComponent(profile)}&print=0`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      const body = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
      const pass = body.includes(doc.documentNo) && !/document not found|404/i.test(body);
      await page.screenshot({ path: `${evidenceDir}/print-${profile}.png`, fullPage: true }).catch(() => null);
      results.push({ name: `Print profile ${profile}`, pass, documentNo: doc.documentNo, finalUrl: page.url() });
    } catch (error) {
      results.push({ name: `Print profile ${profile}`, pass: false, error: error.message });
    }
  }
} finally {
  await browser.close();
}

const meaningfulErrors = errors.filter(message => !/favicon|robots\.txt|ERR_ABORTED|net::ERR_FAILED/i.test(message));
results.push({ name: 'No critical authenticated browser errors', pass: meaningfulErrors.length === 0, errors: meaningfulErrors });
const report = { generatedAt: new Date().toISOString(), tenant: { businessId: runtime.businessId, businessSlug: runtime.businessSlug }, invoiceEvidenceCount: selected.length, results, overall: results.every(item => item.pass) ? 'PASS' : 'FAIL' };
await fs.writeFile('grocery-authenticated-browser-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
