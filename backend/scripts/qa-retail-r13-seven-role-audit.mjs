import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const baseRuntimePath = 'retail-live-audit-runtime.json';
const baseReportPath = 'retail-live-audit-report.json';
const runtimePath = 'retail-r13-seven-role-runtime.json';
const reportPath = 'retail-r13-seven-role-report.json';
const credentialsPath = 'retail-r13-seven-role-credentials.json';

const baseRuntime = JSON.parse(await fs.readFile(baseRuntimePath, 'utf8'));
const baseReport = JSON.parse(await fs.readFile(baseReportPath, 'utf8'));
const backendOrigin = baseRuntime.backendOrigin || baseReport.environment?.backendUrl || 'https://axtor-cloud-pos-production.up.railway.app';
const publicOrigin = baseRuntime.publicOrigin || baseReport.environment?.frontendUrl || 'https://axtorpos.vercel.app';
const businessSlug = baseRuntime.ids?.businessSlug || baseReport.environment?.businessSlug;
const runId = String(baseReport.runId || Date.now());
const owner = baseRuntime.users.find((user) => user.key === 'owner') || baseRuntime.users[0];
const manager = baseRuntime.users.find((user) => user.key === 'manager');
const cashier = baseRuntime.users.find((user) => user.key === 'cashier1');
const spareCashier = baseRuntime.users.find((user) => user.key === 'cashier2');
const salesperson = baseRuntime.users.find((user) => user.key === 'van');

if (!businessSlug || !owner?.email || !owner?.password || !manager || !cashier || !spareCashier || !salesperson) {
  throw new Error('Base Retail audit runtime is missing the users required for R-13 certification');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, {
  method = 'GET',
  token,
  body,
  headers = {},
  expected = [200],
  retries = 2,
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
        throw new Error(`${method} ${path} returned HTTP ${response.status}: ${payload?.error?.message || 'request failed'}`);
      }
      return { status: response.status, payload };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function login(email, password) {
  const { payload } = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { businessSlug, email, password },
    expected: [200],
    retries: 3,
  });
  if (!payload?.token) throw new Error(`Login did not return a token for ${email}`);
  return payload.token;
}

function roleFamily(value) {
  const role = String(value || '').trim().toLowerCase();
  if (/owner/.test(role)) return 'owner';
  if (/manager|supervisor/.test(role)) return 'manager';
  if (/cashier|till operator/.test(role)) return 'cashier';
  if (/salesperson|salesman|sales representative|van sales/.test(role)) return 'salesperson';
  if (/storekeeper|warehouse/.test(role)) return 'storekeeper';
  if (/accountant|finance/.test(role)) return 'accountant';
  if (/auditor|audit/.test(role)) return 'auditor';
  return role;
}

function makePassword(label) {
  return `QaR13!${label}${crypto.randomBytes(9).toString('base64url')}9aA`;
}

const ownerToken = owner.token || await login(owner.email, owner.password);
await request('/health', { expected: [200], retries: 5 });
await request('/api/v1/health/db', { expected: [200], retries: 5 });

let accessControl;
let deploymentAttempts = 0;
for (let attempt = 1; attempt <= 20; attempt += 1) {
  deploymentAttempts = attempt;
  try {
    const response = await request('/api/v1/access-control', {
      token: ownerToken,
      expected: [200],
      retries: 0,
    });
    const roles = Array.isArray(response.payload?.data?.roles) ? response.payload.data.roles : [];
    const exactNames = new Set(roles.map((role) => String(role.name || '').trim()));
    const accountant = roles.find((role) => role.name === 'Accountant');
    const auditor = roles.find((role) => role.name === 'Auditor');
    const storekeeper = roles.find((role) => role.name === 'Storekeeper');
    const salespersonRole = roles.find((role) => role.name === 'Salesperson');
    const latestPermissionShape = Array.isArray(accountant?.permissions)
      && accountant.permissions.includes('accounts.manage')
      && Array.isArray(auditor?.permissions)
      && auditor.permissions.includes('audit_logs.view')
      && Array.isArray(storekeeper?.permissions)
      && storekeeper.permissions.includes('inventory.adjust')
      && Array.isArray(salespersonRole?.permissions)
      && salespersonRole.permissions.includes('sales_documents.create');
    if (exactNames.has('Salesperson') && exactNames.has('Storekeeper') && exactNames.has('Accountant') && exactNames.has('Auditor') && latestPermissionShape) {
      accessControl = response.payload.data;
      break;
    }
  } catch {
    // Railway may still be promoting the merged backend. Retry is bounded below.
  }
  if (attempt < 20) await sleep(15000);
}

if (!accessControl) {
  throw new Error('The merged seven-role backend was not observable in production after 20 bounded deployment checks');
}

const roles = accessControl.roles;
const users = accessControl.users;
const roleByName = new Map(roles.map((role) => [String(role.name), role]));
const requiredRoleNames = ['Salesperson', 'Storekeeper', 'Accountant', 'Auditor'];
for (const name of requiredRoleNames) {
  if (!roleByName.has(name)) throw new Error(`Production role catalogue is missing ${name}`);
}

const permissionAssertions = [
  ['Storekeeper', ['inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.count', 'purchases.receive'], ['accounts.manage', 'sales_documents.refund', 'settings.manage_permissions']],
  ['Accountant', ['accounts.view', 'accounts.manage', 'accounts.reconcile', 'expenses.manage', 'purchases.pay', 'reports.profit'], ['inventory.adjust', 'sales_documents.refund', 'settings.manage_permissions']],
  ['Auditor', ['sales_documents.view', 'payments.view', 'inventory.view', 'accounts.view', 'reports.audit', 'audit_logs.view'], ['sales_documents.create', 'payments.create', 'inventory.adjust', 'expenses.manage', 'settings.manage_permissions']],
];
const permissionEvidence = [];
for (const [roleName, allowed, denied] of permissionAssertions) {
  const permissions = new Set(roleByName.get(roleName)?.permissions || []);
  const missingAllowed = allowed.filter((permission) => !permissions.has(permission));
  const incorrectlyAllowed = denied.filter((permission) => permissions.has(permission));
  const result = missingAllowed.length === 0 && incorrectlyAllowed.length === 0 ? 'PASS' : 'FAIL';
  permissionEvidence.push({ role: roleName, allowed, denied, missingAllowed, incorrectlyAllowed, result });
  if (result !== 'PASS') throw new Error(`${roleName} production permission matrix is incorrect`);
}

const spareUser = users.find((user) => String(user.email || '').toLowerCase() === String(spareCashier.email).toLowerCase());
if (!spareUser) throw new Error('Second Cashier could not be found for Storekeeper reassignment');
await request(`/api/v1/access-control/users/${spareUser.id}/roles`, {
  method: 'PATCH',
  token: ownerToken,
  body: { roleIds: [roleByName.get('Storekeeper').id] },
  expected: [200],
});

const suffix = crypto.randomBytes(5).toString('hex');
const newUserDefinitions = [
  {
    key: 'accountant',
    label: 'Retail Accountant',
    role: 'Accountant',
    email: `qa.retail.accountant.${runId}.${suffix}@example.test`,
    password: makePassword('Accountant'),
  },
  {
    key: 'auditor',
    label: 'Retail Auditor',
    role: 'Auditor',
    email: `qa.retail.auditor.${runId}.${suffix}@example.test`,
    password: makePassword('Auditor'),
  },
];

for (const definition of newUserDefinitions) {
  const role = roleByName.get(definition.role);
  const created = await request('/api/v1/access-control/users', {
    method: 'POST',
    token: ownerToken,
    body: {
      name: definition.label,
      email: definition.email,
      password: definition.password,
      branchId: baseReport.environment?.branchId || undefined,
      roleIds: [role.id],
    },
    expected: [201],
  });
  definition.id = created.payload?.data?.id;
}

const sevenUsers = [
  { ...owner, role: 'Owner', label: owner.label || 'Retail Owner' },
  { ...manager, role: 'Manager', label: manager.label || 'Retail Manager' },
  { ...cashier, role: 'Cashier', label: cashier.label || 'Retail Cashier' },
  { ...salesperson, role: 'Salesperson', label: salesperson.label || 'Retail Salesperson' },
  { ...spareCashier, key: 'storekeeper', role: 'Storekeeper', label: 'Retail Storekeeper' },
  ...newUserDefinitions,
];

for (const user of sevenUsers) {
  user.token = await login(user.email, user.password);
  const me = await request('/api/v1/auth/me', { token: user.token, expected: [200] });
  const observed = [me.payload?.user?.role, ...(Array.isArray(me.payload?.user?.roles) ? me.payload.user.roles : [])].filter(Boolean);
  user.observedRoles = [...new Set(observed.map(String))];
  if (!user.observedRoles.some((role) => roleFamily(role) === roleFamily(user.role))) {
    throw new Error(`${user.label} authenticated without the expected ${user.role} role`);
  }
  if (String(me.payload?.business?.slug || '').toLowerCase() !== String(businessSlug).toLowerCase()) {
    throw new Error(`${user.label} resolved to the wrong tenant`);
  }
}

const userByRole = new Map(sevenUsers.map((user) => [user.role, user]));
const checks = [];
async function permissionCheck(role, label, path, { method = 'GET', body, headers, expected }) {
  const user = userByRole.get(role);
  const response = await request(path, {
    method,
    token: user.token,
    body,
    headers,
    expected,
    retries: 1,
  });
  const result = expected.includes(response.status) ? 'PASS' : 'FAIL';
  checks.push({ role, label, method, path, expected, observed: response.status, result });
  if (result !== 'PASS') throw new Error(`${role} permission check failed: ${label}`);
  return response;
}

await permissionCheck('Owner', 'Owner can administer access control', '/api/v1/access-control', { expected: [200] });

await permissionCheck('Manager', 'Manager can view products', '/api/v1/products?active=true', { expected: [200] });
await permissionCheck('Manager', 'Manager can view inventory', '/api/v1/inventory/stock', { expected: [200] });
await permissionCheck('Manager', 'Manager can view reports', '/api/v1/reports/options', { expected: [200] });
await permissionCheck('Manager', 'Manager cannot administer roles', '/api/v1/access-control', { expected: [403] });

await permissionCheck('Cashier', 'Cashier can view products', '/api/v1/products?active=true', { expected: [200] });
await permissionCheck('Cashier', 'Cashier can view customers', '/api/v1/customers?active=true', { expected: [200] });
await permissionCheck('Cashier', 'Cashier can view sales documents', '/api/v1/sales-documents?documentType=invoice&limit=5', { expected: [200] });
await permissionCheck('Cashier', 'Cashier cannot refund customers', '/api/v1/refunds', { method: 'POST', body: {}, expected: [403] });
await permissionCheck('Cashier', 'Cashier cannot adjust inventory', '/api/v1/inventory/adjustments', { method: 'POST', body: {}, expected: [403] });
await permissionCheck('Cashier', 'Cashier cannot administer roles', '/api/v1/access-control', { expected: [403] });

await permissionCheck('Salesperson', 'Salesperson can view products', '/api/v1/products?active=true', { expected: [200] });
await permissionCheck('Salesperson', 'Salesperson can view customers', '/api/v1/customers?active=true', { expected: [200] });
await permissionCheck('Salesperson', 'Salesperson can view sales documents', '/api/v1/sales-documents?documentType=invoice&limit=5', { expected: [200] });
await permissionCheck('Salesperson', 'Salesperson cannot refund customers', '/api/v1/refunds', { method: 'POST', body: {}, expected: [403] });
await permissionCheck('Salesperson', 'Salesperson cannot adjust inventory', '/api/v1/inventory/adjustments', { method: 'POST', body: {}, expected: [403] });
await permissionCheck('Salesperson', 'Salesperson cannot administer roles', '/api/v1/access-control', { expected: [403] });

await permissionCheck('Storekeeper', 'Storekeeper can view inventory', '/api/v1/inventory/stock', { expected: [200] });
await permissionCheck('Storekeeper', 'Storekeeper can view purchases', '/api/v1/purchases', { expected: [200] });
await permissionCheck('Storekeeper', 'Storekeeper can view suppliers', '/api/v1/suppliers?active=true', { expected: [200] });
const productId = baseRuntime.products?.[0]?.id;
const warehouseId = baseRuntime.ids?.mainWarehouseId || baseReport.environment?.warehouseId;
if (!productId || !warehouseId) throw new Error('Retail runtime is missing product or warehouse IDs for Storekeeper mutation verification');
await permissionCheck('Storekeeper', 'Storekeeper can post an inventory adjustment', '/api/v1/inventory/adjustments', {
  method: 'POST',
  headers: { 'Idempotency-Key': `${runId}:r13:storekeeper:add` },
  body: { productId, warehouseId, type: 'add', qty: 1, reason: 'R-13 allowed-write verification' },
  expected: [200],
});
await permissionCheck('Storekeeper', 'Storekeeper can reverse the verification adjustment', '/api/v1/inventory/adjustments', {
  method: 'POST',
  headers: { 'Idempotency-Key': `${runId}:r13:storekeeper:reverse` },
  body: { productId, warehouseId, type: 'subtract', qty: 1, reason: 'R-13 allowed-write reversal' },
  expected: [200],
});
await permissionCheck('Storekeeper', 'Storekeeper cannot manage accounts', '/api/v1/accounts', { expected: [403] });
await permissionCheck('Storekeeper', 'Storekeeper cannot refund customers', '/api/v1/refunds', { method: 'POST', body: {}, expected: [403] });
await permissionCheck('Storekeeper', 'Storekeeper cannot administer roles', '/api/v1/access-control', { expected: [403] });

await permissionCheck('Accountant', 'Accountant can view accounts', '/api/v1/accounts', { expected: [200] });
await permissionCheck('Accountant', 'Accountant can view expenses', '/api/v1/expenses', { expected: [200] });
await permissionCheck('Accountant', 'Accountant can view reports', '/api/v1/reports/options', { expected: [200] });
await permissionCheck('Accountant', 'Accountant can view payments', '/api/v1/payments?limit=5', { expected: [200] });
const expense = await permissionCheck('Accountant', 'Accountant can create an expense', '/api/v1/expenses', {
  method: 'POST',
  body: { category: 'R-13 QA', amount: 1, description: 'Temporary role-permission verification' },
  expected: [200],
});
const expenseId = expense.payload?.data?.id;
if (!expenseId) throw new Error('Accountant expense verification did not return an expense ID');
await permissionCheck('Accountant', 'Accountant can remove the temporary expense', `/api/v1/expenses/${expenseId}`, {
  method: 'DELETE',
  expected: [200],
});
await permissionCheck('Accountant', 'Accountant cannot adjust inventory', '/api/v1/inventory/adjustments', { method: 'POST', body: {}, expected: [403] });
await permissionCheck('Accountant', 'Accountant cannot refund customers', '/api/v1/refunds', { method: 'POST', body: {}, expected: [403] });
await permissionCheck('Accountant', 'Accountant cannot administer roles', '/api/v1/access-control', { expected: [403] });

await permissionCheck('Auditor', 'Auditor can view sales documents', '/api/v1/sales-documents?documentType=invoice&limit=5', { expected: [200] });
await permissionCheck('Auditor', 'Auditor can view inventory', '/api/v1/inventory/stock', { expected: [200] });
await permissionCheck('Auditor', 'Auditor can view accounts', '/api/v1/accounts', { expected: [200] });
await permissionCheck('Auditor', 'Auditor can view reports', '/api/v1/reports/options', { expected: [200] });
await permissionCheck('Auditor', 'Auditor cannot create payments', '/api/v1/payments', { method: 'POST', body: {}, expected: [403] });
await permissionCheck('Auditor', 'Auditor cannot create products', '/api/v1/products', { method: 'POST', body: {}, expected: [403] });
await permissionCheck('Auditor', 'Auditor cannot create expenses', '/api/v1/expenses', { method: 'POST', body: {}, expected: [403] });
await permissionCheck('Auditor', 'Auditor cannot change settings', '/api/v1/settings/r13-qa', { method: 'PUT', body: { value: true }, expected: [403] });
await permissionCheck('Auditor', 'Auditor cannot administer roles', '/api/v1/access-control', { expected: [403] });

const report = {
  runId,
  startedFromRetailAudit: baseReport.runId,
  verifiedAt: new Date().toISOString(),
  frontendUrl: publicOrigin,
  backendUrl: backendOrigin,
  businessId: baseReport.environment?.businessId,
  businessSlug,
  industry: baseReport.environment?.industry,
  deploymentAttempts,
  health: { application: 'PASS', database: 'PASS' },
  canonicalRoles: requiredRoleNames.map((name) => ({
    name,
    id: roleByName.get(name)?.id,
    permissions: roleByName.get(name)?.permissions || [],
  })),
  permissionMatrix: permissionEvidence,
  users: sevenUsers.map((user) => ({
    key: user.key,
    label: user.label,
    email: user.email,
    expectedRole: user.role,
    observedRoles: user.observedRoles,
    result: 'PASS',
  })),
  apiChecks: checks,
  summary: {
    userCount: sevenUsers.length,
    usersPassed: sevenUsers.length,
    apiChecks: checks.length,
    apiChecksPassed: checks.filter((check) => check.result === 'PASS').length,
    permissionMatrices: permissionEvidence.length,
    permissionMatricesPassed: permissionEvidence.filter((entry) => entry.result === 'PASS').length,
  },
  overall: sevenUsers.length === 7
    && checks.every((check) => check.result === 'PASS')
    && permissionEvidence.every((entry) => entry.result === 'PASS')
      ? 'PASS'
      : 'FAIL',
};

const browserRuntime = {
  publicOrigin,
  backendOrigin,
  businessSlug,
  users: sevenUsers.map((user) => ({
    key: user.key,
    label: user.label,
    role: user.role,
    email: user.email,
    password: user.password,
  })),
};
const credentials = {
  generatedAt: new Date().toISOString(),
  businessSlug,
  businessId: baseReport.environment?.businessId,
  users: browserRuntime.users,
};

await fs.writeFile(runtimePath, JSON.stringify(browserRuntime, null, 2));
await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2));
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log('Retail R-13 seven-role API audit:', report.summary, report.overall);
if (report.overall !== 'PASS') process.exit(1);