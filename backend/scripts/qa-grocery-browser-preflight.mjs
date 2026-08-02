import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const publicOrigin = process.env.AXTOR_PUBLIC_ORIGIN || 'https://axtorpos.vercel.app';
const evidenceDir = 'grocery-browser-evidence';
await fs.mkdir(evidenceDir, { recursive: true });

const results = [];
const errors = [];
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('response', response => { if (response.status() >= 500) errors.push(`http ${response.status()}: ${response.url()}`); });

  const response = await page.goto(`${publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const fields = {
    workspace: await page.locator('#businessSlug').count(),
    email: await page.locator('#loginEmail').count(),
    password: await page.locator('#loginPassword').count(),
    button: await page.locator('#loginButton').count(),
  };
  await page.screenshot({ path: `${evidenceDir}/login-page.png`, fullPage: true });
  results.push({ name: 'Live login form', pass: response?.status() === 200 && Object.values(fields).every(v => v === 1), details: fields });
  await context.close();
} catch (error) {
  results.push({ name: 'Browser execution', pass: false, error: error.message });
} finally {
  if (browser) await browser.close();
}

const meaningfulErrors = errors.filter(message => !/favicon|ERR_ABORTED|robots\.txt|net::ERR_FAILED/i.test(message));
results.push({ name: 'No critical browser errors', pass: meaningfulErrors.length === 0, errors: meaningfulErrors });
const report = { generatedAt: new Date().toISOString(), publicOrigin, note: 'Grocery route HTTP coverage is enforced by qa-grocery-live-preflight.mjs; this browser gate validates the real login DOM only.', results, overall: results.every(item => item.pass) ? 'PASS' : 'FAIL' };
await fs.writeFile('grocery-browser-preflight-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
