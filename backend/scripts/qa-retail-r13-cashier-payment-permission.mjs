import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const runtime = JSON.parse(await fs.readFile('retail-live-audit-runtime.json', 'utf8'));
const report = JSON.parse(await fs.readFile('retail-live-audit-report.json', 'utf8'));
const backendOrigin = runtime.backendOrigin || report.environment?.backendUrl || 'https://axtor-cloud-pos-production.up.railway.app';
const businessSlug = runtime.ids?.businessSlug || report.environment?.businessSlug;
const cashier = runtime.users?.find((user) => user.key === 'cashier1');

if (!businessSlug || !cashier?.email || !cashier?.password) {
  throw new Error('Retail runtime is missing the Cashier credentials required for the payment permission probe');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${backendOrigin}${path}`, {
        method: options.method || 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const payload = await response.json().catch(() => null);
      return { status: response.status, payload };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError;
}

let token = cashier.token;
if (!token) {
  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { businessSlug, email: cashier.email, password: cashier.password },
  }, 3);
  if (login.status !== 200 || !login.payload?.token) {
    throw new Error(`Retail Cashier login failed with HTTP ${login.status}`);
  }
  token = login.payload.token;
}

const me = await request('/api/v1/auth/me', { token });
if (me.status !== 200) throw new Error(`Retail Cashier /auth/me returned HTTP ${me.status}`);
const observedRoles = [me.payload?.user?.role, ...(Array.isArray(me.payload?.user?.roles) ? me.payload.user.roles : [])].filter(Boolean).map(String);
if (!observedRoles.some((role) => /cashier|till operator/i.test(role))) {
  throw new Error('The payment permission probe did not authenticate as a Cashier role');
}

const permissionResponse = await request('/api/v1/payments', {
  method: 'POST',
  token,
  headers: { 'Idempotency-Key': `retail-r13-cashier-${crypto.randomUUID()}` },
  body: {},
}, 1);

const errorMessage = String(permissionResponse.payload?.error?.message || '');
const passed = permissionResponse.status === 400 && !/permission denied|payments\.create/i.test(errorMessage);
const evidence = {
  verifiedAt: new Date().toISOString(),
  businessSlug,
  role: 'Cashier',
  observedRoles,
  endpoint: 'POST /api/v1/payments',
  expectedStatus: 400,
  observedStatus: permissionResponse.status,
  result: passed ? 'PASS' : 'FAIL',
  detail: passed
    ? 'Cashier authorization passed and the request reached payment business validation without creating a payment.'
    : `Cashier payment permission failed before business validation: HTTP ${permissionResponse.status}${errorMessage ? ` — ${errorMessage}` : ''}`,
};

await fs.writeFile('retail-r13-cashier-payment-permission.json', JSON.stringify(evidence, null, 2));
console.log('Retail Cashier payment permission:', evidence.result, evidence.observedStatus);
if (!passed) process.exit(1);
