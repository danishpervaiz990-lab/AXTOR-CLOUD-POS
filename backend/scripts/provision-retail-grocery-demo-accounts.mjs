import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const backendOrigin = process.env.AXTOR_BACKEND_ORIGIN || 'https://axtor-cloud-pos-production.up.railway.app';
const publicOrigin = process.env.AXTOR_PUBLIC_ORIGIN || 'https://axtorpos.vercel.app';
const runTag = String(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^0-9A-Za-z]/g, '').slice(-14);
const outputPath = process.env.AXTOR_ACCOUNT_OUTPUT || 'retail-grocery-demo-credentials.json';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function strongPassword(prefix) {
  return `${prefix}!${crypto.randomBytes(12).toString('base64url')}9aA`;
}

async function request(path, {
  method = 'GET', token, body, headers = {}, expected = [200], retries = 3,
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
        const retryable = response.status === 429 || response.status === 503 || response.status >= 500;
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        const error = new Error(`${method} ${path} returned HTTP ${response.status}: ${payload?.error?.message || 'request failed'}`);
        error.status = response.status;
        error.retryable = retryable;
        error.retryAfter = retryAfter;
        throw error;
      }
      return { status: response.status, payload };
    } catch (error) {
      lastError = error;
      if (attempt >= retries || error.retryable === false) break;
      const delay = Math.max(Number(error.retryAfter || 0) * 1000, 2000 * (attempt + 1));
      await sleep(delay);
    }
  }
  throw lastError;
}

async function login(businessSlug, email, password) {
  const { payload } = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { businessSlug, email, password },
    expected: [200],
    retries: 4,
  });
  if (!payload?.token) throw new Error(`Login did not return a token for ${email}`);
  return payload.token;
}

function dataOf(response) {
  return response?.payload?.data ?? response?.payload;
}

function roleByExact(roles, names) {
  const wanted = names.map((name) => name.toLowerCase());
  return roles.find((role) => wanted.includes(String(role.name || '').trim().toLowerCase()));
}

function roleByPattern(roles, patterns, excluded = []) {
  return roles.find((role) => {
    const name = String(role.name || '').trim();
    return patterns.some((pattern) => pattern.test(name)) && !excluded.some((pattern) => pattern.test(name));
  });
}

async function getPlanCode() {
  const catalog = dataOf(await request('/api/v1/public/catalog', { expected: [200], retries: 4 }));
  const plans = Array.isArray(catalog?.plans) ? catalog.plans : [];
  const preferred = plans.find((plan) => String(plan.code).toLowerCase() === 'professional')
    || plans.find((plan) => plan.isRecommended)
    || plans.find((plan) => Number(plan.maxUsers || 0) >= 8)
    || plans[0];
  if (!preferred?.code) throw new Error('No active subscription plan is available for demo provisioning');
  return String(preferred.code).toLowerCase();
}

async function registerTenant({ industryCode, businessName, emailPrefix, invoicePrefix, planCode }) {
  const ownerPassword = strongPassword(`${industryCode}Owner`);
  const ownerEmail = `${emailPrefix}.owner.${runTag}@example.test`;
  const idempotencyKey = `demo-accounts:${industryCode}:${runTag}:${crypto.randomBytes(6).toString('hex')}`;
  const registration = dataOf(await request('/api/v1/public/register', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    expected: [201],
    retries: 8,
    body: {
      businessName,
      ownerName: `${businessName} Owner`,
      email: ownerEmail,
      password: ownerPassword,
      country: 'QA',
      timezone: 'Asia/Qatar',
      baseCurrency: 'QAR',
      language: 'en',
      industryCode,
      planCode,
      billingCycle: 'MONTHLY',
      firstBranch: 'Main Branch',
      firstWarehouse: 'Main Warehouse',
      firstCounter: 'Counter 1',
      taxSystem: 'none',
      taxLabel: 'Tax',
      invoicePrefix,
      printProfile: 'a4',
      pricesIncludeTax: false,
      sampleDataRequested: false,
      acceptTerms: true,
      acceptPrivacy: true,
    },
  }));

  const businessSlug = String(registration?.business?.slug || '').trim();
  const branchId = registration?.branch?.id || registration?.firstBranch?.id || null;
  let ownerToken = registration?.auth?.token;
  if (!businessSlug) throw new Error(`${industryCode} registration did not return a business slug`);
  if (!ownerToken) ownerToken = await login(businessSlug, ownerEmail, ownerPassword);

  const me = dataOf(await request('/api/v1/auth/me', { token: ownerToken, expected: [200] }));
  if (String(me?.business?.slug || registration?.business?.slug || '').toLowerCase() !== businessSlug.toLowerCase()) {
    throw new Error(`${industryCode} owner resolved to the wrong tenant`);
  }

  return {
    industryCode,
    businessName,
    businessSlug,
    branchId,
    owner: {
      name: `${businessName} Owner`,
      email: ownerEmail,
      password: ownerPassword,
      role: 'Owner',
      access: 'Full tenant ownership and recovery access',
    },
    ownerToken,
  };
}

async function createAndVerifyUser(tenant, definition) {
  const temporaryPassword = strongPassword(`${tenant.industryCode}Temp`);
  const finalPassword = strongPassword(`${tenant.industryCode}${definition.key}`);
  const email = `${definition.emailPrefix}.${runTag}@example.test`;

  await request('/api/v1/access-control/users', {
    method: 'POST',
    token: tenant.ownerToken,
    expected: [201],
    body: {
      name: definition.name,
      email,
      password: temporaryPassword,
      branchId: tenant.branchId || undefined,
      roleIds: [definition.role.id],
    },
  });

  let token = await login(tenant.businessSlug, email, temporaryPassword);
  let me = dataOf(await request('/api/v1/auth/me', { token, expected: [200] }));
  let usablePassword = temporaryPassword;

  if (me?.user?.mustChangePassword === true) {
    await request('/api/v1/auth/change-password', {
      method: 'POST',
      token,
      expected: [200],
      body: { currentPassword: temporaryPassword, newPassword: finalPassword },
    });
    usablePassword = finalPassword;
    token = await login(tenant.businessSlug, email, usablePassword);
    me = dataOf(await request('/api/v1/auth/me', { token, expected: [200] }));
  }

  const observedRoles = [me?.user?.role, ...(Array.isArray(me?.user?.roles) ? me.user.roles : [])]
    .filter(Boolean).map(String);
  if (!observedRoles.some((role) => role.toLowerCase() === String(definition.role.name).toLowerCase())) {
    throw new Error(`${email} authenticated without expected role ${definition.role.name}; observed ${observedRoles.join(', ')}`);
  }
  if (me?.user?.mustChangePassword === true) throw new Error(`${email} remains blocked by password rotation`);

  for (const check of definition.checks || []) {
    await request(check.path, {
      method: check.method || 'GET',
      token,
      body: check.body,
      expected: check.expected,
      retries: 1,
    });
  }

  return {
    name: definition.name,
    email,
    password: usablePassword,
    role: definition.role.name,
    access: definition.access,
    verified: true,
  };
}

async function provisionRoles(tenant) {
  const access = dataOf(await request('/api/v1/access-control', {
    token: tenant.ownerToken,
    expected: [200],
    retries: 4,
  }));
  const roles = Array.isArray(access?.roles) ? access.roles : [];
  if (!roles.length) throw new Error(`${tenant.industryCode} access-control returned no roles`);

  const required = (role, label) => {
    if (!role) throw new Error(`${tenant.industryCode} role catalogue is missing ${label}. Available: ${roles.map((item) => item.name).join(', ')}`);
    return role;
  };

  const admin = required(roleByExact(roles, ['Admin']), 'Admin');
  const accountant = required(
    roleByExact(roles, ['Accountant', 'Grocery Accountant']) || roleByPattern(roles, [/account/i, /finance/i]),
    'Accountant',
  );
  const auditor = required(
    roleByExact(roles, ['Auditor', 'Grocery Auditor', 'Read Only']) || roleByPattern(roles, [/auditor/i, /read.?only/i]),
    'Auditor or Read Only',
  );

  if (tenant.industryCode === 'retail') {
    return [
      { key: 'Admin', name: 'Retail Admin', emailPrefix: 'axtor.retail.admin', role: admin, access: 'Full access except protected Owner-only recovery actions', checks: [{ path: '/api/v1/access-control', expected: [200] }] },
      { key: 'Manager', name: 'Retail Manager', emailPrefix: 'axtor.retail.manager', role: required(roleByExact(roles, ['Manager', 'Retail Manager']), 'Manager'), access: 'Daily operations, sales, customers, stock and reports; no role administration', checks: [{ path: '/api/v1/products?active=true', expected: [200] }, { path: '/api/v1/access-control', expected: [403] }] },
      { key: 'Cashier', name: 'Retail Cashier', emailPrefix: 'axtor.retail.cashier', role: required(roleByExact(roles, ['Cashier', 'Retail Cashier']), 'Cashier'), access: 'Counter sales and permitted payments; no refunds, stock adjustments or user administration', checks: [{ path: '/api/v1/products?active=true', expected: [200] }, { path: '/api/v1/access-control', expected: [403] }] },
      { key: 'Salesperson', name: 'Retail Salesperson', emailPrefix: 'axtor.retail.salesperson', role: required(roleByExact(roles, ['Salesperson', 'Salesman']), 'Salesperson'), access: 'Sales and customer workflows; no refunds, stock adjustments or user administration', checks: [{ path: '/api/v1/sales-documents?limit=5', expected: [200] }, { path: '/api/v1/access-control', expected: [403] }] },
      { key: 'Storekeeper', name: 'Retail Storekeeper', emailPrefix: 'axtor.retail.storekeeper', role: required(roleByExact(roles, ['Storekeeper', 'Warehouse']), 'Storekeeper'), access: 'Inventory, receiving and warehouse operations; no accounts, refunds or role administration', checks: [{ path: '/api/v1/inventory/stock', expected: [200] }, { path: '/api/v1/access-control', expected: [403] }] },
      { key: 'Accountant', name: 'Retail Accountant', emailPrefix: 'axtor.retail.accountant', role: accountant, access: 'Accounts, expenses, reconciliation and financial reports; no inventory adjustment or role administration', checks: [{ path: '/api/v1/accounts', expected: [200] }, { path: '/api/v1/access-control', expected: [403] }] },
      { key: 'Auditor', name: 'Retail Auditor', emailPrefix: 'axtor.retail.auditor', role: auditor, access: 'Read-only audit, reports and transaction visibility; no operational writes', checks: [{ path: '/api/v1/reports/options', expected: [200] }, { path: '/api/v1/access-control', expected: [403] }] },
    ];
  }

  const groceryManager = required(roleByExact(roles, ['Grocery Manager', 'Manager']) || roleByPattern(roles, [/grocery.*manager/i]), 'Grocery Manager');
  const groceryCashier = required(roleByExact(roles, ['Grocery Cashier', 'Cashier']) || roleByPattern(roles, [/grocery.*cashier/i]), 'Grocery Cashier');
  const inventory = required(
    roleByExact(roles, ['Grocery Inventory Controller', 'Inventory Controller', 'Storekeeper', 'Warehouse', 'Receiving and Inventory'])
      || roleByPattern(roles, [/inventory/i, /warehouse/i, /storekeeper/i, /receiv/i], [/manager/i]),
    'Grocery Inventory/Receiving role',
  );

  return [
    { key: 'Admin', name: 'Grocery Admin', emailPrefix: 'axtor.grocery.admin', role: admin, access: 'Full access except protected Owner-only recovery actions', checks: [{ path: '/api/v1/access-control', expected: [200] }] },
    { key: 'Manager', name: 'Grocery Manager', emailPrefix: 'axtor.grocery.manager', role: groceryManager, access: 'Full grocery operations, reporting and supervision; no protected Owner administration', checks: [{ path: '/api/v1/products?active=true', expected: [200] }, { path: '/api/v1/access-control', expected: [403] }] },
    { key: 'Cashier', name: 'Grocery Cashier', emailPrefix: 'axtor.grocery.cashier', role: groceryCashier, access: 'FEFO checkout and permitted payments; no inventory adjustment, refunds or user administration', checks: [{ path: '/api/v1/products?active=true', expected: [200] }, { path: '/api/v1/access-control', expected: [403] }] },
    { key: 'Accountant', name: 'Grocery Accountant', emailPrefix: 'axtor.grocery.accountant', role: accountant, access: 'Accounts, expenses, supplier/customer reconciliation and financial reports; no stock or user administration', checks: [{ path: '/api/v1/accounts', expected: [200] }, { path: '/api/v1/access-control', expected: [403] }] },
    { key: 'Inventory', name: 'Grocery Inventory and Receiving', emailPrefix: 'axtor.grocery.inventory', role: inventory, access: 'Receiving, batch/expiry and inventory operations; no financial or role administration', checks: [{ path: '/api/v1/inventory/stock', expected: [200] }, { path: '/api/v1/access-control', expected: [403] }] },
    { key: 'Auditor', name: 'Grocery Auditor', emailPrefix: 'axtor.grocery.auditor', role: auditor, access: 'Read-only reports and transaction review; no operational writes', checks: [{ path: '/api/v1/reports/options', expected: [200] }, { path: '/api/v1/access-control', expected: [403] }] },
  ];
}

await request('/health', { expected: [200], retries: 6 });
await request('/api/v1/health/db', { expected: [200], retries: 6 });
const planCode = await getPlanCode();

const tenants = [];
tenants.push(await registerTenant({
  industryCode: 'retail',
  businessName: `Axtor General Retail Live QA ${runTag}`,
  emailPrefix: 'axtor.retail',
  invoicePrefix: 'RTL',
  planCode,
}));
await sleep(5000);
tenants.push(await registerTenant({
  industryCode: 'grocery',
  businessName: `Axtor Grocery Supermarket Live QA ${runTag}`,
  emailPrefix: 'axtor.grocery',
  invoicePrefix: 'GRC',
  planCode,
}));

const result = {
  createdAt: new Date().toISOString(),
  frontendUrl: publicOrigin,
  backendUrl: backendOrigin,
  planCode,
  tenants: [],
};

for (const tenant of tenants) {
  const definitions = await provisionRoles(tenant);
  const accounts = [tenant.owner];
  for (const definition of definitions) {
    accounts.push(await createAndVerifyUser(tenant, definition));
  }
  result.tenants.push({
    industry: tenant.industryCode,
    businessName: tenant.businessName,
    businessSlug: tenant.businessSlug,
    loginUrl: `${publicOrigin}/login.html`,
    accounts,
  });
  delete tenant.ownerToken;
}

await fs.writeFile(outputPath, JSON.stringify(result, null, 2), { mode: 0o600 });
console.log('Retail and Grocery demo account provisioning PASS', {
  tenants: result.tenants.map((tenant) => ({ industry: tenant.industry, accountCount: tenant.accounts.length })),
  passwordsPrinted: false,
});
