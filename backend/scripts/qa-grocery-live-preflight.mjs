import fs from 'node:fs/promises';

const publicOrigin = process.env.AXTOR_PUBLIC_ORIGIN || 'https://axtorpos.vercel.app';
const backendOrigin = process.env.AXTOR_BACKEND_ORIGIN || 'https://axtor-cloud-pos-production.up.railway.app';
const checks = [];

async function check(name, url, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000), ...options });
    const text = await response.text();
    const pass = options.expectedStatuses ? options.expectedStatuses.includes(response.status) : response.ok;
    checks.push({ name, url, status: response.status, durationMs: Date.now() - started, pass, sample: text.slice(0, 500) });
  } catch (error) {
    checks.push({ name, url, status: null, durationMs: Date.now() - started, pass: false, error: error.message });
  }
}

await check('Frontend login', `${publicOrigin}/login.html`);
await check('Backend health', `${backendOrigin}/health`);
await check('Database health', `${backendOrigin}/api/v1/health/db`);

for (const path of [
  '/apps/grocery/grocery-dashboard.html',
  '/apps/grocery/grocery-terminal.html',
  '/apps/grocery/grocery-products.html',
  '/apps/grocery/grocery-batches.html',
  '/apps/grocery/grocery-expiry.html',
  '/apps/grocery/grocery-receiving.html',
  '/apps/grocery/grocery-waste.html',
  '/apps/grocery/grocery-recalls.html',
  '/apps/grocery/grocery-reports.html',
  '/apps/grocery/grocery-settings.html',
]) {
  await check(`Grocery route ${path}`, `${publicOrigin}${path}`, { expectedStatuses: [200] });
}

for (const endpoint of [
  '/api/v1/customers',
  '/api/v1/products',
  '/api/v1/sales-documents',
  '/api/v1/inventory/stock',
  '/api/v1/industry/batches',
]) {
  await check(`Unauthenticated API guard ${endpoint}`, `${backendOrigin}${endpoint}`, { expectedStatuses: [401, 403] });
}

const report = {
  generatedAt: new Date().toISOString(),
  environment: { publicOrigin, backendOrigin },
  checks,
  overall: checks.every((item) => item.pass) ? 'PASS' : 'FAIL',
};
await fs.writeFile('grocery-live-preflight-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
