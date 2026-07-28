import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:4173';
const outputDir = path.resolve('industry-preview-gallery');
fs.mkdirSync(outputDir, { recursive: true });

const industries = [
  ['retail', 'frontend-retail', 'retail-dashboard.html', 'General Retail'],
  ['grocery', 'frontend-grocery', 'grocery-dashboard.html', 'Grocery / Supermarket'],
  ['pharmacy', 'frontend-pharmacy', 'pharmacy-dashboard.html', 'Pharmacy'],
  ['gym', 'frontend-gym', 'gym-dashboard.html', 'Gym / Fitness'],
  ['school', 'frontend-school', 'school-dashboard.html', 'School'],
  ['clinic', 'frontend-clinic', 'clinic-dashboard.html', 'Clinic'],
  ['restaurant', 'frontend-restaurant', 'restaurant-dashboard.html', 'Restaurant'],
  ['hardware', 'frontend-hardware', 'hardware-dashboard.html', 'Hardware'],
  ['paint', 'frontend-paint', 'paint-dashboard.html', 'Paint'],
  ['furniture', 'frontend-furniture', 'furniture-dashboard.html', 'Furniture'],
  ['workshop', 'frontend-workshop', 'workshop-dashboard.html', 'Workshop / Garage'],
  ['wholesale', 'frontend-wholesale', 'wholesale-dashboard.html', 'Wholesale / Distribution'],
  ['manufacturing', 'fix/manufacturing/dedicated-frontend-v1', 'manufacturing-dashboard.html', 'Manufacturing / Factory']
];

const dashboardData = {
  todaySales: 12450,
  grossMargin: 3820,
  lowStock: 7,
  outstandingReceivables: 21500,
  activeMembers: 428,
  renewalsDue: 16,
  todayCheckins: 91,
  classUtilization: 74,
  overdueMemberships: 9,
  totalStudents: 862,
  attendanceToday: 806,
  feesCollected: 48200,
  overdueFees: 31,
  pendingAdmissions: 18,
  todayAppointments: 32,
  waitingPatients: 6,
  noShows: 2,
  serviceRevenue: 18600,
  receivables: 9400,
  nearExpiryValue: 3250,
  expiredStock: 4,
  wasteValue: 620,
  prescriptionsPending: 8,
  occupiedTables: 14,
  activeOrders: 21,
  kitchenTickets: 9,
  openWorkOrders: 17,
  productionInProgress: 8,
  qualityPending: 3,
  finishedToday: 5,
  materialShortages: 2,
  capacityUtilization: 81
};

function responseFor(industry, request) {
  const url = new URL(request.url());
  const pathname = url.pathname;
  const method = request.method();
  const business = {
    id: `preview-${industry}`,
    name: `Axtor ${industry[0].toUpperCase()}${industry.slice(1)} Preview`,
    slug: `${industry}-preview`,
    status: 'ACTIVE',
    currency: 'QAR',
    industry: { code: industry, name: industry }
  };
  const user = { id: 'preview-owner', name: 'Preview Owner', email: 'preview@example.invalid', role: 'Owner', roles: ['Owner'] };

  if (pathname.endsWith('/api/v1/auth/me')) return { ok: true, business, user };
  if (pathname.endsWith('/api/v1/commercial/context')) {
    return { ok: true, data: { business, user, industry: { industry: business.industry }, subscription: { status: 'ACTIVE', plan: 'PREVIEW' }, permissions: ['*'] } };
  }
  if (pathname.endsWith('/api/v1/industry/registry')) {
    return { ok: true, data: { selected: { code: industry, name: industry, modules: [] }, selection: { code: industry, name: industry, provisioningState: 'READY' }, permissions: ['*'], canManage: true } };
  }
  if (/\/dashboard(?:\?|$)/.test(pathname) || pathname.endsWith('/summary')) {
    return { ok: true, data: { ...dashboardData, metrics: dashboardData, summary: dashboardData, recent: [], alerts: [], records: [] } };
  }
  if (pathname.includes('/health')) return { ok: true, status: 'ok' };
  if (method === 'GET' || method === 'HEAD') return { ok: true, data: [], meta: { total: 0 } };
  return { ok: true, data: { id: 'preview-record', status: 'saved' } };
}

const browser = await chromium.launch({ headless: true });
const report = { generatedAt: new Date().toISOString(), mode: 'local-static-preview-no-deployment', results: [] };

for (const [industry, branch, dashboard, label] of industries) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    ignoreHTTPSErrors: true
  });
  await context.addInitScript(({ industry, label }) => {
    const business = { id: `preview-${industry}`, name: `Axtor ${label} Preview`, slug: `${industry}-preview`, status: 'ACTIVE', industry: { code: industry, name: label } };
    const user = { id: 'preview-owner', name: 'Preview Owner', email: 'preview@example.invalid', role: 'Owner', roles: ['Owner'], businessId: business.id, businessSlug: business.slug };
    localStorage.setItem('axtorAuthToken', 'preview-token-not-production');
    localStorage.setItem('axtorTokenType', 'Bearer');
    localStorage.setItem('axtorApiBaseUrl', 'http://127.0.0.1:4173/mock-api');
    localStorage.setItem('axtorBusiness', JSON.stringify(business));
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('axtorCurrentUser', JSON.stringify(user));
    sessionStorage.removeItem('axtorAuthRedirectInProgress');
  }, { industry, label });
  await context.route(/\/api\/v1\//, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(responseFor(industry, route.request())) });
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(error.message));
  const url = `${origin}/${industry}/demo-static/${dashboard}`;
  const result = { industry, label, branch, dashboard, url, status: 'PASS', heading: '', navigation: [], screenshot: `${industry}.png`, consoleErrors: [] };
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response || response.status() !== 200) throw new Error(`Dashboard returned HTTP ${response?.status() ?? 'no response'}`);
    await page.waitForTimeout(2500);
    const finalUrl = page.url();
    if (/login\.html|\/login(?:\?|$)/i.test(finalUrl)) throw new Error(`Dashboard redirected to login: ${finalUrl}`);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (/generic industry workspace|industry\.html\?module=/i.test(bodyText)) throw new Error('Generic industry workspace content detected');
    result.heading = (await page.locator('h1, h2').first().innerText().catch(() => ''))?.trim() || await page.title();
    result.navigation = await page.locator('aside nav a, .sidebar a, .m-nav a').allInnerTexts().catch(() => []);
    result.navigation = result.navigation.map(value => value.trim()).filter(Boolean).slice(0, 24);
    if (!result.heading) throw new Error('No page heading rendered');
    if (result.navigation.length < 4) throw new Error(`Only ${result.navigation.length} navigation entries rendered`);
    await page.screenshot({ path: path.join(outputDir, result.screenshot), fullPage: true });
    result.consoleErrors = consoleErrors.filter(value => !/favicon|net::ERR_|Failed to load resource/i.test(value)).slice(0, 20);
  } catch (error) {
    result.status = 'FAIL';
    result.error = error instanceof Error ? error.message : String(error);
    await page.screenshot({ path: path.join(outputDir, result.screenshot), fullPage: true }).catch(() => {});
  }
  report.results.push(result);
  await context.close();
}

await browser.close();
fs.writeFileSync(path.join(outputDir, 'preview-report.json'), JSON.stringify(report, null, 2));

const cards = report.results.map(item => `
<article class="card ${item.status.toLowerCase()}">
  <div class="meta"><strong>${item.label}</strong><span>${item.status}</span></div>
  <p>${item.branch} · ${item.dashboard}</p>
  <p class="heading">${item.heading || item.error || 'No heading'}</p>
  <img src="${item.screenshot}" alt="${item.label} local preview">
  <details><summary>Navigation (${item.navigation.length})</summary><div class="chips">${item.navigation.map(value => `<span>${value.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</span>`).join('')}</div></details>
</article>`).join('\n');

fs.writeFileSync(path.join(outputDir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Axtor POS — 13 Industry Local Preview</title><style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#eef5f1;color:#14231e}header{padding:28px;background:#123d30;color:white}header h1{margin:0 0 8px}header p{margin:0;color:#c9eadf}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:18px;padding:22px}.card{background:white;border:1px solid #d4e2dc;border-radius:18px;padding:16px;box-shadow:0 12px 36px rgba(20,42,35,.08)}.card.fail{border-color:#d33}.meta{display:flex;justify-content:space-between;gap:12px}.meta span{font-weight:800;color:#08775b}.fail .meta span{color:#b42318}.card p{color:#65756f;font-size:13px}.card .heading{font-size:16px;color:#14231e;font-weight:800}.card img{width:100%;border:1px solid #d9e4df;border-radius:12px;background:#fff}.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.chips span{padding:5px 8px;border-radius:999px;background:#e8f5ef;font-size:11px}summary{cursor:pointer;font-weight:700;margin-top:12px}</style></head><body><header><h1>Axtor POS — 13 Industry Preview</h1><p>Generated locally in GitHub Actions with mocked tenant data. No Vercel or Railway deployment was performed.</p></header><main class="grid">${cards}</main></body></html>`);

const failed = report.results.filter(item => item.status !== 'PASS');
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exit(1);
