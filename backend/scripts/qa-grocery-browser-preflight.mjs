import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const publicOrigin = process.env.AXTOR_PUBLIC_ORIGIN || 'https://axtorpos.vercel.app';
const evidenceDir = 'grocery-browser-evidence';
const routes = [
  'grocery-dashboard.html','grocery-terminal.html','grocery-products.html','grocery-batches.html',
  'grocery-expiry.html','grocery-receiving.html','grocery-waste.html','grocery-recalls.html',
  'grocery-reports.html','grocery-settings.html',
];

await fs.mkdir(evidenceDir, { recursive: true });
const results = [];
const errors = [];
let browser;

async function inspect(url, name, screenshot) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`${name}: console: ${msg.text()}`); });
  page.on('pageerror', error => errors.push(`${name}: pageerror: ${error.message}`));
  page.on('response', response => { if (response.status() >= 500) errors.push(`${name}: http ${response.status()}: ${response.url()}`); });
  try {
    const response = await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
    const body = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '');
    if (screenshot) await page.screenshot({ path: `${evidenceDir}/${screenshot}`, fullPage: true }).catch(() => null);
    return { status: response?.status() || null, finalUrl: page.url(), body };
  } finally {
    await context.close();
  }
}

try {
  browser = await chromium.launch({ headless: true });
  const login = await inspect(`${publicOrigin}/login.html`, 'login', 'login-page.png');
  const loginContext = await browser.newContext({ serviceWorkers: 'block' });
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${publicOrigin}/login.html`, { waitUntil: 'commit', timeout: 30000 });
  await loginPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => null);
  const fields = {
    workspace: await loginPage.locator('#businessSlug').count(),
    email: await loginPage.locator('#loginEmail').count(),
    password: await loginPage.locator('#loginPassword').count(),
    button: await loginPage.locator('#loginButton').count(),
  };
  await loginContext.close();
  results.push({ name: 'Live login form', pass: login.status === 200 && Object.values(fields).every(v => v === 1), details: fields });

  for (const route of routes) {
    try {
      const page = await inspect(`${publicOrigin}/apps/grocery/${route}`, route, null);
      const pass = page.status === 200 && !/404|page not found/i.test(page.body) && (page.finalUrl.includes('/login.html') || /grocery|sign in|login/i.test(page.body));
      results.push({ name: `Route ${route}`, pass, status: page.status, finalUrl: page.finalUrl, bodySample: page.body.slice(0, 300) });
    } catch (error) {
      results.push({ name: `Route ${route}`, pass: false, error: error.message });
    }
  }
} catch (error) {
  results.push({ name: 'Browser execution', pass: false, error: error.message });
} finally {
  if (browser) await browser.close();
}

const meaningfulErrors = errors.filter(message => !/favicon|ERR_ABORTED|robots\.txt|net::ERR_FAILED/i.test(message));
results.push({ name: 'No critical browser errors', pass: meaningfulErrors.length === 0, errors: meaningfulErrors });
const report = { generatedAt: new Date().toISOString(), publicOrigin, results, overall: results.every(item => item.pass) ? 'PASS' : 'FAIL' };
await fs.writeFile('grocery-browser-preflight-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
