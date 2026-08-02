import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/axtor-playwright/package.json');
const { chromium } = require('playwright');
const publicOrigin = process.env.AXTOR_PUBLIC_ORIGIN || 'https://axtorpos.vercel.app';
const evidenceDir = 'grocery-browser-evidence';
await fs.mkdir(evidenceDir, { recursive: true });

const results = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 500) errors.push(`http ${response.status()}: ${response.url()}`);
  });

  await page.goto(`${publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const loginFields = {
    workspace: await page.locator('#businessSlug').count(),
    email: await page.locator('#loginEmail').count(),
    password: await page.locator('#loginPassword').count(),
    button: await page.locator('#loginButton').count(),
  };
  const loginPass = Object.values(loginFields).every((count) => count === 1);
  await page.screenshot({ path: `${evidenceDir}/login-page.png`, fullPage: true });
  results.push({ name: 'Live login form', pass: loginPass, details: loginFields });

  const routes = [
    'grocery-dashboard.html', 'grocery-terminal.html', 'grocery-products.html',
    'grocery-batches.html', 'grocery-expiry.html', 'grocery-receiving.html',
    'grocery-waste.html', 'grocery-recalls.html', 'grocery-reports.html', 'grocery-settings.html',
  ];
  for (const route of routes) {
    await page.goto(`${publicOrigin}/apps/grocery/${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(800);
    const body = await page.locator('body').innerText().catch(() => '');
    const finalUrl = page.url();
    const pass = !/404|page not found/i.test(body) && (finalUrl.includes('/login.html') || /grocery|sign in|login/i.test(body));
    results.push({ name: `Route ${route}`, pass, finalUrl, bodySample: body.slice(0, 300) });
  }

  const meaningfulErrors = errors.filter((message) => !/favicon|ERR_ABORTED|robots\.txt/i.test(message));
  results.push({ name: 'No critical browser errors', pass: meaningfulErrors.length === 0, errors: meaningfulErrors });
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  publicOrigin,
  results,
  overall: results.every((item) => item.pass) ? 'PASS' : 'FAIL',
};
await fs.writeFile('grocery-browser-preflight-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
