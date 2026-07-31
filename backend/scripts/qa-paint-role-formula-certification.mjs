import fs from 'node:fs/promises';

const runtime = JSON.parse(await fs.readFile('paint-live-audit-runtime.json', 'utf8'));
const report = JSON.parse(await fs.readFile('paint-live-audit-report.json', 'utf8'));
const backend = runtime.backendOrigin || process.env.AXTOR_BACKEND_ORIGIN;
const businessSlug = runtime.businessSlug || runtime.business?.slug || runtime.tenant?.businessSlug || 'axtor-demo';
const owner = runtime.users?.find((u) => u.key === 'owner');
if (!backend || !owner?.token) throw new Error('Paint certification requires backend and owner token');

const runId = `PAINT-CERT-${Date.now()}`;
const checks = [];
const failures = [];
const createdUsers = [];
const blockers = [];
const pass = (name, detail) => checks.push({ name, result: 'PASS', detail });
const fail = (name, detail, blocker = false) => {
  checks.push({ name, result: 'FAIL', detail, blocker });
  failures.push(`${name}: ${detail}`);
  if (blocker) blockers.push(`${name}: ${detail}`);
};
const unwrap = (p) => p?.data ?? p;

async function req(path, { token = owner.token, method = 'GET', body, expected = [200, 201] } = {}) {
  const res = await fetch(`${backend}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': `${runId}:${method}:${path}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!expected.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(payload)}`);
  return unwrap(payload);
}

async function login(email, password) {
  const res = await fetch(`${backend}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessSlug, email, password }) });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`login ${email} -> ${res.status}: ${JSON.stringify(payload)}`);
  const data = unwrap(payload);
  return data.token || data.accessToken;
}

try {
  const bootstrap = await req('/api/v1/paint/bootstrap', { method: 'POST', body: {} });
  pass('Paint industry bootstrap', `${bootstrap.roles?.length || 0} roles and formula ${bootstrap.formula?.formulaCode || bootstrap.formula?.id} available`);
} catch (e) { fail('Paint industry bootstrap', e.message, true); }

const roleAliases = {
  owner: ['owner'],
  salesperson: ['salesperson', 'salesman', 'sales representative', 'sales'],
  cashier: ['cashier'],
  lab: ['mixing lab technician', 'mixing lab', 'lab technician', 'paint mixer', 'mixer', 'technician'],
  accounts: ['accounts', 'accountant', 'finance'],
};

let access;
try {
  access = await req('/api/v1/access-control');
  pass('Access-control catalogue available', `${access.roles?.length || 0} roles found`);
} catch (e) { fail('Access-control catalogue available', e.message); }

const roles = access?.roles || [];
const findRole = (key) => roles.find((r) => roleAliases[key].some((alias) => String(r.name || '').toLowerCase() === alias));
const roleResults = {};

for (const key of ['salesperson', 'cashier', 'lab', 'accounts']) {
  const role = findRole(key);
  if (!role) { fail(`${key} role exists`, `No dedicated ${key} role found`, true); continue; }
  try {
    const email = `qa-paint-${key}-${Date.now()}@axtor.invalid`;
    const password = `AxtorQA!${Date.now()}x`;
    const user = await req('/api/v1/access-control/users', { method: 'POST', body: { name: `QA Paint ${key} ${runId}`, email, password, roleIds: [role.id] } });
    const token = await login(email, password);
    if (!token) throw new Error('Login returned no token');
    createdUsers.push({ key, id: user.id, email });
    roleResults[key] = { token, role };
    pass(`${key} user provisioned`, `${role.name} login succeeded`);
  } catch (e) { fail(`${key} user provisioned`, e.message); }
}

const roleProbes = {
  salesperson: ['/api/v1/paint/dashboard', '/api/v1/paint/colors', '/api/v1/paint/formulas', '/api/v1/sales-documents', '/api/v1/customers'],
  cashier: ['/api/v1/shifts', '/api/v1/payments', '/api/v1/sales-documents', '/api/v1/customers'],
  lab: ['/api/v1/paint/dashboard', '/api/v1/paint/formulas', '/api/v1/paint/mix-jobs', '/api/v1/paint/component-stock'],
  accounts: ['/api/v1/accounts', '/api/v1/expenses', '/api/v1/reports/options', '/api/v1/paint/reports'],
};
for (const [key, paths] of Object.entries(roleProbes)) {
  const token = roleResults[key]?.token;
  if (!token) continue;
  try {
    for (const path of paths) await req(path, { token });
    pass(`${key} permitted workspace`, `${paths.length} dedicated endpoints accessible`);
  } catch (e) { fail(`${key} permitted workspace`, e.message); }
}

let formula;
try {
  const formulas = await req('/api/v1/paint/formulas');
  formula = Array.isArray(formulas) ? formulas[0] : formulas?.[0];
  if (!formula?.id) throw new Error('No active Paint formula/product line is seeded; custom formula creation cannot be certified');
  pass('Paint formula catalogue', `Formula ${formula.formulaCode || formula.id} available`);
} catch (e) { fail('Paint formula catalogue', e.message, true); }

if (formula?.id) {
  try {
    const components = [
      { componentCode: `TINT-W-${runId}`, componentName: 'White Tinter', quantity: 0.72, unit: 'kg' },
      { componentCode: `TINT-B-${runId}`, componentName: 'Blue Tinter', quantity: 0.18, unit: 'kg' },
      { componentCode: `TINT-K-${runId}`, componentName: 'Black Tinter', quantity: 0.10, unit: 'kg' },
    ];
    for (const c of components) await req('/api/v1/paint/component-stock', { method: 'PUT', body: { ...c, quantityOnHand: 500, averageCost: 8, minimumStock: 10 } });
    const revision = await req(`/api/v1/paint/formulas/${formula.id}/revisions`, { method: 'POST', body: { expectedRevision: Number(formula.currentRevision || 1), notes: `Custom customer shade ${runId}`, components } });
    pass('Custom formula revision', `Revision ${revision.revision} created with 3 tinters`);
    const job = await req('/api/v1/paint/mix-jobs', { method: 'POST', body: { formulaId: formula.id, quantity: 2, unit: 'ltr', sellingPrice: 180, customerReference: `CUSTOM-SHADE-${runId}`, vehicleProjectReference: 'QA color match', nonReturnableAccepted: true } });
    await req(`/api/v1/paint/mix-jobs/${job.id}/status`, { method: 'PATCH', body: { status: 'mixing' } });
    await req(`/api/v1/paint/mix-jobs/${job.id}/post-consumption`, { method: 'POST', body: {} });
    await req(`/api/v1/paint/mix-jobs/${job.id}/quality-checks`, { method: 'POST', body: { result: 'passed', notes: 'Shade and viscosity approved' } });
    const label = await req(`/api/v1/paint/mix-jobs/${job.id}/label`, { method: 'POST', body: {} });
    await req(`/api/v1/paint/mix-jobs/${job.id}/deliver`, { method: 'POST', body: {} });
    pass('Mixing lab end-to-end', `Mix job ${job.jobNo || job.id}, QC passed, label ${label.labelNo || 'created'}, delivered`);
  } catch (e) { fail('Mixing lab end-to-end', e.message); }
}

try {
  const ownerPaths = ['/api/v1/paint/dashboard', '/api/v1/paint/reports', '/api/v1/dashboard/summary', '/api/v1/accounts', '/api/v1/expenses', '/api/v1/reports/options'];
  for (const path of ownerPaths) await req(path);
  pass('Owner executive access', `${ownerPaths.length} operational, finance and Paint reporting endpoints accessible`);
} catch (e) { fail('Owner executive access', e.message); }

report.paintIndustryCertification = { runId, checks, failures, blockers, createdUsers, scope: ['salesperson', 'cashier', 'mixing_lab', 'accounts', 'owner', 'custom_formulas', 'formula_revisions', 'component_consumption', 'quality_control', 'label', 'delivery'] };
report.overall = failures.length === 0 && report.overall === 'PASS' ? 'PASS' : 'FAIL';
await fs.writeFile('paint-live-audit-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.paintIndustryCertification, null, 2));
if (failures.length) process.exitCode = 1;
