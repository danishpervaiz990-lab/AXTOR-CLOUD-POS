import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const backendOrigin = process.env.AXTOR_BACKEND_ORIGIN || 'https://axtor-cloud-pos-production.up.railway.app';
const publicOrigin = process.env.AXTOR_PUBLIC_ORIGIN || 'https://axtorpos.vercel.app';
const outputPath = process.env.AXTOR_RECHECK_OUTPUT || 'live-user-development-recheck.json';
const runId = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^0-9A-Za-z]/g, '').slice(-14);
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2m2sAAAAASUVORK5CYII=', 'base64');
const report = {
  runId,
  startedAt: new Date().toISOString(),
  environment: { backendOrigin, publicOrigin },
  deployment: {},
  tenants: {},
  roleChecks: [],
  browserChecks: [],
  errors: [],
  overall: 'RUNNING',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function strongPassword(label) {
  return `Qa!${label}${crypto.randomBytes(12).toString('base64url')}9aA`;
}

function unwrap(payload) {
  return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
}

async function request(path, {
  method = 'GET', token, body, headers = {}, expected = [200], retries = 3, retryDelay = 2500,
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${backendOrigin}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!expected.includes(response.status)) {
        const error = new Error(`${method} ${path} returned HTTP ${response.status}: ${payload?.error?.message || 'request failed'}`);
        error.status = response.status;
        error.payload = payload;
        error.retryable = response.status === 429 || response.status === 503 || response.status >= 500;
        error.retryAfter = Number(response.headers.get('retry-after') || 0);
        throw error;
      }
      return { status: response.status, payload, headers: response.headers };
    } catch (error) {
      lastError = error;
      if (attempt >= retries || error.retryable === false) break;
      await sleep(Math.max(Number(error.retryAfter || 0) * 1000, retryDelay * (attempt + 1)));
    }
  }
  throw lastError;
}

async function login(slug, email, password) {
  const response = await request('/api/v1/auth/login', {
    method: 'POST', body: { businessSlug: slug, email, password }, expected: [200], retries: 4,
  });
  const payload = unwrap(response.payload);
  const token = response.payload?.token || payload?.token;
  if (!token) throw new Error('Login response did not return a token');
  return token;
}

async function waitForPublicDeployment() {
  let last = '';
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    const response = await fetch(`${publicOrigin}/apps/grocery/grocery-dashboard.html?audit=${runId}-${attempt}`, { cache: 'no-store' });
    const html = await response.text();
    last = html;
    const release = response.headers.get('x-axtor-gateway-release');
    const branch = response.headers.get('x-axtor-frontend-branch');
    if (response.ok && release === '20260804-strict-industry-development1' && branch === 'frontend-grocery'
      && html.includes('data-axtor-development-runtime="20260804-strict2"')
      && html.includes('grocery-branding-runtime.js?v=20260804-branding1')) {
      report.deployment.gatewayRelease = release;
      report.deployment.groceryBranch = branch;
      report.deployment.runtime = '20260804-strict2';
      return;
    }
    await sleep(10000);
  }
  throw new Error(`Vercel did not expose strict2 Grocery release; last marker length ${last.length}`);
}

async function healthChecks() {
  await request('/health', { expected: [200], retries: 15, retryDelay: 4000 });
  await request('/api/v1/health/db', { expected: [200], retries: 15, retryDelay: 4000 });
  report.deployment.backendHealth = 'PASS';
  report.deployment.databaseHealth = 'PASS';
}

async function planCode() {
  const data = unwrap((await request('/api/v1/public/catalog', { retries: 8 })).payload) || {};
  const plans = Array.isArray(data.plans) ? data.plans : [];
  const plan = plans.find((item) => String(item.code).toLowerCase() === 'professional')
    || plans.find((item) => item.isRecommended)
    || plans.find((item) => Number(item.maxUsers || 0) >= 8)
    || plans[0];
  if (!plan?.code) throw new Error('No active plan is available for QA registration');
  return String(plan.code).toLowerCase();
}

async function registerTenant(industryCode, plan) {
  const label = industryCode[0].toUpperCase() + industryCode.slice(1);
  const email = `qa.live.${industryCode}.${runId}.${crypto.randomBytes(3).toString('hex')}@example.test`;
  const password = strongPassword(`${label}Owner`);
  const idempotency = `live-recheck:${industryCode}:${runId}:${crypto.randomBytes(8).toString('hex')}`;
  const response = await request('/api/v1/public/register', {
    method: 'POST', expected: [201], retries: 10, retryDelay: 3500,
    headers: { 'Idempotency-Key': idempotency },
    body: {
      businessName: `Axtor ${label} Live Recheck ${runId}`,
      ownerName: `${label} Live Owner`, email, password,
      country: 'QA', timezone: 'Asia/Qatar', baseCurrency: 'QAR', language: 'en',
      industryCode, planCode: plan, billingCycle: 'MONTHLY',
      firstBranch: 'Main Branch', firstWarehouse: 'Main Warehouse', firstCounter: 'Counter 1',
      taxSystem: 'none', taxLabel: 'Tax', invoicePrefix: industryCode.slice(0, 3).toUpperCase(),
      printProfile: 'a4', pricesIncludeTax: false, sampleDataRequested: false,
      acceptTerms: true, acceptPrivacy: true,
    },
  });
  const data = unwrap(response.payload) || {};
  const slug = String(data.business?.slug || '').trim();
  const token = data.auth?.token || await login(slug, email, password);
  if (!slug || !token) throw new Error(`${industryCode} registration did not produce a usable session`);
  const me = unwrap((await request('/api/v1/auth/me', { token })).payload) || {};
  assert.equal(String(me.business?.slug || data.business?.slug).toLowerCase(), slug.toLowerCase());
  const registry = unwrap((await request('/api/v1/industry/registry', { token })).payload) || {};
  const actual = String(registry.selection?.code || registry.selected?.code || '').toLowerCase();
  assert.equal(actual, industryCode, `${industryCode} tenant resolved to ${actual}`);
  report.tenants[industryCode] = { registration: 'PASS', auth: 'PASS', industryResolution: actual };
  return { industryCode, slug, email, password, token };
}

function exactRole(roles, names) {
  const wanted = names.map((name) => name.toLowerCase());
  return roles.find((role) => wanted.includes(String(role.name || '').trim().toLowerCase()));
}

async function createRoleUser(tenant, role, label) {
  const email = `qa.${tenant.industryCode}.${label.toLowerCase().replace(/[^a-z]+/g, '.')}.${runId}.${crypto.randomBytes(2).toString('hex')}@example.test`;
  const temporary = strongPassword(`${label}Temp`);
  const finalPassword = strongPassword(`${label}Final`);
  await request('/api/v1/access-control/users', {
    method: 'POST', token: tenant.token, expected: [201],
    body: { name: `${tenant.industryCode} ${label}`, email, password: temporary, roleIds: [role.id] },
  });
  let token = await login(tenant.slug, email, temporary);
  let me = unwrap((await request('/api/v1/auth/me', { token })).payload) || {};
  let password = temporary;
  if (me.user?.mustChangePassword === true) {
    await request('/api/v1/auth/change-password', {
      method: 'POST', token, expected: [200],
      body: { currentPassword: temporary, newPassword: finalPassword },
    });
    password = finalPassword;
    token = await login(tenant.slug, email, password);
    me = unwrap((await request('/api/v1/auth/me', { token })).payload) || {};
  }
  assert.notEqual(me.user?.mustChangePassword, true, `${label} remains password-rotation blocked`);
  const observed = [me.user?.role, ...(Array.isArray(me.user?.roles) ? me.user.roles : [])].filter(Boolean).map(String);
  assert.ok(observed.some((name) => name.toLowerCase() === String(role.name).toLowerCase()), `${label} role mismatch`);
  return { label, role: role.name, email, password, token };
}

async function roleBoundary(tenant, user, path, expected, method = 'GET', body) {
  const response = await request(path, { method, token: user.token, body, expected, retries: 1 });
  report.roleChecks.push({ industry: tenant.industryCode, role: user.role, path, expected, observed: response.status, result: 'PASS' });
}

async function verifyRoleMatrix(tenant) {
  const access = unwrap((await request('/api/v1/access-control', { token: tenant.token })).payload) || {};
  const roles = Array.isArray(access.roles) ? access.roles : [];
  const definitions = tenant.industryCode === 'retail'
    ? [
      ['Admin', ['Admin'], [['/api/v1/access-control', [200]], ['/api/v1/reports/options', [200]]]],
      ['Manager', ['Manager', 'Retail Manager'], [['/api/v1/products?active=true', [200]], ['/api/v1/access-control', [403]]]],
      ['Cashier', ['Cashier', 'Retail Cashier'], [['/api/v1/products?active=true', [200]], ['/api/v1/access-control', [403]]]],
      ['Accountant', ['Accountant'], [['/api/v1/accounts', [200]], ['/api/v1/access-control', [403]]]],
      ['Storekeeper', ['Storekeeper', 'Warehouse'], [['/api/v1/inventory/stock', [200]], ['/api/v1/access-control', [403]]]],
      ['Auditor', ['Auditor'], [['/api/v1/reports/options', [200]], ['/api/v1/access-control', [403]]]],
    ]
    : [
      ['Admin', ['Admin'], [['/api/v1/access-control', [200]], ['/api/v1/reports/options', [200]]]],
      ['Manager', ['Store Manager', 'Manager'], [['/api/v1/products?active=true', [200]], ['/api/v1/access-control', [403]]]],
      ['Cashier', ['Cashier'], [['/api/v1/products?active=true', [200]], ['/api/v1/access-control', [403]]]],
      ['Accountant', ['Accountant'], [['/api/v1/accounts', [200]], ['/api/v1/access-control', [403]]]],
      ['Storekeeper', ['Storekeeper', 'Warehouse'], [['/api/v1/inventory/stock', [200]], ['/api/v1/access-control', [403]]]],
      ['Auditor', ['Auditor'], [['/api/v1/reports/options', [200]], ['/api/v1/access-control', [403]]]],
    ];

  for (const [label, names, checks] of definitions) {
    const role = exactRole(roles, names);
    assert.ok(role, `${tenant.industryCode} role ${label} is missing; available: ${roles.map((item) => item.name).join(', ')}`);
    const user = await createRoleUser(tenant, role, label);
    for (const [path, expected] of checks) await roleBoundary(tenant, user, path, expected);
  }
  report.tenants[tenant.industryCode].roleMatrix = 'PASS';
}

async function waitForReportsDeployment(tenant) {
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    try {
      const ledger = unwrap((await request('/api/v1/reports/transaction-ledger?from=2026-08-01&to=2026-08-31', { token: tenant.token, retries: 0 })).payload);
      const methods = unwrap((await request('/api/v1/reports/payment-receipt-methods?from=2026-08-01&to=2026-08-31', { token: tenant.token, retries: 0 })).payload);
      if (ledger?.title === 'Debit / Credit Transaction Ledger' && methods?.title === 'Payments / Receipts by Method') {
        report.tenants[tenant.industryCode].financialReports = 'PASS';
        return;
      }
    } catch {
      // Railway may still be promoting the merged backend.
    }
    await sleep(10000);
  }
  throw new Error(`${tenant.industryCode} financial movement reports were not observable in production`);
}

async function verifyOwnerAccess(tenant) {
  await request('/api/v1/access-control', { token: tenant.token, expected: [200] });
  await request('/api/v1/settings', { token: tenant.token, expected: [200] });
  await request('/api/v1/reports/options', { token: tenant.token, expected: [200] });
  await waitForReportsDeployment(tenant);
  report.tenants[tenant.industryCode].ownerFullAccess = 'PASS';
}

function browserCollector(page, industry, pageName) {
  const evidence = { industry, page: pageName, consoleErrors: [], pageErrors: [], httpErrors: [], canvasErrors: [] };
  page.on('console', (message) => {
    const text = message.text();
    if (/Canvas is already in use/i.test(text)) evidence.canvasErrors.push(text);
    if (message.type() === 'error') evidence.consoleErrors.push(text);
  });
  page.on('pageerror', (error) => {
    const text = String(error?.message || error);
    evidence.pageErrors.push(text);
    if (/Canvas is already in use/i.test(text)) evidence.canvasErrors.push(text);
  });
  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !/favicon|robots\.txt/i.test(url)) evidence.httpErrors.push({ status, url: url.replace(/\?.*$/, '') });
  });
  return evidence;
}

async function authenticatedPage(browser, tenant) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(`${publicOrigin}/login.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(({ token }) => {
    localStorage.setItem('axtorAuthToken', token);
    sessionStorage.removeItem('axtorAuthReturnUrl');
    sessionStorage.removeItem('axtorAuthRedirectInProgress');
  }, { token: tenant.token });
  return { context, page };
}

async function settle(page, ms = 2500) {
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
  await page.waitForTimeout(ms);
}

async function assertNoPlanOrCanvas(page, evidence) {
  const state = await page.evaluate(() => ({
    planBlocks: document.querySelectorAll('.axtor-plan-block').length,
    text: document.body?.innerText || '',
  }));
  assert.equal(state.planBlocks, 0, 'Plan block remains in DOM');
  assert.ok(!/Unavailable on your current plan/i.test(state.text), 'Plan modal remains visible');
  assert.ok(!/^Trial:.*day\(s\) remaining/im.test(state.text), 'Trial label remains visible');
  assert.equal(evidence.canvasErrors.length, 0, 'Canvas reuse error was observed');
}

async function uploadLogoAndVerify(page, tenant, inputSelector, saveSelector, statusSelector, themeSelector, themeValue, settingKey) {
  await page.setInputFiles(inputSelector, { name: 'qa-logo.png', mimeType: 'image/png', buffer: tinyPng });
  if (themeSelector && themeValue) await page.selectOption(themeSelector, themeValue);
  if (saveSelector) {
    await page.click(saveSelector);
    if (statusSelector) await page.waitForFunction((selector) => /saved|uploaded/i.test(document.querySelector(selector)?.textContent || ''), statusSelector, { timeout: 30000 });
  } else {
    await page.waitForTimeout(2500);
  }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const settingsPayload = unwrap((await request('/api/v1/settings', { token: tenant.token })).payload) || {};
    const values = settingsPayload.values || settingsPayload;
    if (String(values?.['company.profile']?.logoData || '').startsWith('data:image/png')) {
      if (settingKey && themeValue) assert.equal(values?.[settingKey]?.theme, themeValue);
      return;
    }
    await sleep(1000);
  }
  throw new Error(`${tenant.industryCode} logo was not persisted to company.profile`);
}

async function browserAuditTenant(browser, tenant) {
  const { context, page } = await authenticatedPage(browser, tenant);
  const ownerPages = [];
  try {
    let evidence = browserCollector(page, tenant.industryCode, 'router');
    await page.goto(`${publicOrigin}/router.html?audit=${runId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction((industry) => location.pathname.includes(`/apps/${industry}/`), tenant.industryCode, { timeout: 60000 });
    await settle(page);
    await assertNoPlanOrCanvas(page, evidence);
    ownerPages.push({ page: 'router', result: 'PASS' });

    if (tenant.industryCode === 'grocery') {
      evidence = browserCollector(page, 'grocery', 'dashboard');
      await page.goto(`${publicOrigin}/apps/grocery/grocery-dashboard.html?audit=${runId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page, 4000);
      await page.waitForSelector('#groceryIndustryWidgets', { timeout: 30000 });
      assert.ok((await page.locator('body').innerText()).includes('Freshness Control'));
      assert.ok(!(await page.locator('body').innerText()).includes('Retail Reports'));
      await assertNoPlanOrCanvas(page, evidence);
      ownerPages.push({ page: 'dashboard', result: 'PASS' });

      evidence = browserCollector(page, 'grocery', 'settings');
      await page.goto(`${publicOrigin}/apps/grocery/grocery-settings.html?audit=${runId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page, 4500);
      await page.waitForSelector('#groceryLogoUpload', { timeout: 30000 });
      await page.waitForSelector('#groceryThemeChoice', { timeout: 30000 });
      await uploadLogoAndVerify(page, tenant, '#groceryLogoUpload', '#saveGroceryBranding', '#groceryBrandingStatus', '#groceryThemeChoice', 'night-market', 'appearance.grocery');
      await assertNoPlanOrCanvas(page, evidence);
      ownerPages.push({ page: 'settings-logo-theme', result: 'PASS' });

      evidence = browserCollector(page, 'grocery', 'reports');
      await page.goto(`${publicOrigin}/apps/grocery/grocery-reports.html?audit=${runId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page, 5000);
      await page.waitForSelector('#groceryMovementReports', { timeout: 30000 });
      assert.ok(await page.locator('#gmReport option[value="transaction-ledger"]').count());
      assert.ok(await page.locator('#gmReport option[value="payment-receipt-methods"]').count());
      await assertNoPlanOrCanvas(page, evidence);
      ownerPages.push({ page: 'reports', result: 'PASS' });

      evidence = browserCollector(page, 'grocery', 'cross-industry-retail-url');
      await page.goto(`${publicOrigin}/apps/retail/reports.html?audit=${runId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => location.pathname.includes('/apps/grocery/'), { timeout: 60000 });
      await settle(page);
      assert.ok(page.url().includes('/apps/grocery/'), `Grocery session remained on wrong app: ${page.url()}`);
      ownerPages.push({ page: 'cross-industry-correction', result: 'PASS' });
    }

    if (tenant.industryCode === 'retail') {
      evidence = browserCollector(page, 'retail', 'reports');
      await page.goto(`${publicOrigin}/apps/retail/reports.html?audit=${runId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page, 4500);
      await page.waitForSelector('#reportSelect', { timeout: 30000 });
      assert.ok(await page.locator('#reportSelect option[value="transaction-ledger"]').count());
      assert.ok(await page.locator('#reportSelect option[value="payment-receipt-methods"]').count());
      await assertNoPlanOrCanvas(page, evidence);
      ownerPages.push({ page: 'reports', result: 'PASS' });

      evidence = browserCollector(page, 'retail', 'settings');
      await page.goto(`${publicOrigin}/apps/retail/settings.html?audit=${runId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page, 4000);
      await page.waitForSelector('[data-image-upload="logoData"]', { timeout: 30000 });
      await uploadLogoAndVerify(page, tenant, '[data-image-upload="logoData"]', null, null, null, null, null);
      await assertNoPlanOrCanvas(page, evidence);
      ownerPages.push({ page: 'settings-logo', result: 'PASS' });
    }

    if (tenant.industryCode === 'paint') {
      evidence = browserCollector(page, 'paint', 'dashboard');
      await page.goto(`${publicOrigin}/apps/paint/paint-dashboard.html?audit=${runId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page, 4000);
      await page.waitForSelector('#paintIndustryWidgets', { timeout: 30000 });
      assert.ok((await page.locator('body').innerText()).includes('Colour Formula'));
      await assertNoPlanOrCanvas(page, evidence);
      ownerPages.push({ page: 'dashboard', result: 'PASS' });

      evidence = browserCollector(page, 'paint', 'settings');
      await page.goto(`${publicOrigin}/apps/paint/paint-settings.html?audit=${runId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page, 4000);
      await page.waitForSelector('#paintLogoUpload', { timeout: 30000 });
      await uploadLogoAndVerify(page, tenant, '#paintLogoUpload', '#savePaintBranding', '#paintBrandingStatus', '#paintThemeChoice', 'industrial-lab', 'appearance.paint');
      await assertNoPlanOrCanvas(page, evidence);
      ownerPages.push({ page: 'settings-logo-theme', result: 'PASS' });

      evidence = browserCollector(page, 'paint', 'reports');
      await page.goto(`${publicOrigin}/apps/paint/paint-reports.html?audit=${runId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page, 4500);
      await page.waitForSelector('#paintMovementReports', { timeout: 30000 });
      assert.ok(await page.locator('#pmReport option[value="transaction-ledger"]').count());
      assert.ok(await page.locator('#pmReport option[value="payment-receipt-methods"]').count());
      await assertNoPlanOrCanvas(page, evidence);
      ownerPages.push({ page: 'reports', result: 'PASS' });

      evidence = browserCollector(page, 'paint', 'cross-industry-grocery-url');
      await page.goto(`${publicOrigin}/apps/grocery/grocery-dashboard.html?audit=${runId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => location.pathname.includes('/apps/paint/'), { timeout: 60000 });
      ownerPages.push({ page: 'cross-industry-correction', result: 'PASS' });
    }

    report.browserChecks.push({ industry: tenant.industryCode, pages: ownerPages, result: 'PASS' });
    report.tenants[tenant.industryCode].browser = 'PASS';
  } finally {
    await context.close();
  }
}

async function main() {
  let browser;
  try {
    await healthChecks();
    await waitForPublicDeployment();
    const plan = await planCode();
    const retail = await registerTenant('retail', plan);
    await sleep(5000);
    const grocery = await registerTenant('grocery', plan);
    await sleep(5000);
    const paint = await registerTenant('paint', plan);

    for (const tenant of [retail, grocery, paint]) await verifyOwnerAccess(tenant);
    await verifyRoleMatrix(retail);
    await verifyRoleMatrix(grocery);

    browser = await chromium.launch({ headless: true });
    for (const tenant of [retail, grocery, paint]) await browserAuditTenant(browser, tenant);

    report.overall = 'PASS';
  } catch (error) {
    report.overall = 'FAIL';
    report.errors.push({ message: error?.message || String(error), stack: String(error?.stack || '').split('\n').slice(0, 8) });
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    report.completedAt = new Date().toISOString();
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    console.log('Live user development recheck', {
      overall: report.overall,
      industries: Object.fromEntries(Object.entries(report.tenants).map(([key, value]) => [key, Object.keys(value)])),
      roleChecks: report.roleChecks.length,
      browserIndustries: report.browserChecks.length,
      credentialsPrinted: false,
    });
  }
}

await main();
