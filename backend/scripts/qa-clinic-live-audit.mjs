import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const publicOrigin = String(process.env.AXTOR_PUBLIC_ORIGIN || 'https://axtorpos.vercel.app').replace(/\/$/, '');
const backendOrigin = String(process.env.AXTOR_BACKEND_ORIGIN || 'https://axtor-cloud-pos-production.up.railway.app').replace(/\/$/, '');
const businessSlug = String(process.env.AXTOR_CLINIC_BUSINESS_SLUG || '').trim();

const roleSpecs = [
  ['owner', 'Owner', 'AXTOR_CLINIC_OWNER_EMAIL', 'AXTOR_CLINIC_OWNER_PASSWORD'],
  ['receptionist', 'Receptionist', 'AXTOR_CLINIC_RECEPTIONIST_EMAIL', 'AXTOR_CLINIC_RECEPTIONIST_PASSWORD'],
  ['doctor', 'Doctor', 'AXTOR_CLINIC_DOCTOR_EMAIL', 'AXTOR_CLINIC_DOCTOR_PASSWORD'],
  ['nurse', 'Nurse', 'AXTOR_CLINIC_NURSE_EMAIL', 'AXTOR_CLINIC_NURSE_PASSWORD'],
  ['cashier', 'Cashier', 'AXTOR_CLINIC_CASHIER_EMAIL', 'AXTOR_CLINIC_CASHIER_PASSWORD'],
];

const users = roleSpecs.map(([key, role, emailKey, passwordKey]) => ({
  key,
  role,
  email: String(process.env[emailKey] || '').trim(),
  password: String(process.env[passwordKey] || ''),
}));

const requiredConfiguration = {
  businessSlug: Boolean(businessSlug),
  fiveUsersConfigured: users.length === 5 && users.every((user) => user.email && user.password),
};

async function request(path, options = {}) {
  const response = await fetch(`${backendOrigin}${path}`, {
    redirect: 'manual',
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, ok: response.ok, body, headers: Object.fromEntries(response.headers.entries()) };
}

function unwrap(value) { return value?.data ?? value; }
function list(value) {
  const data = unwrap(value) || [];
  return Array.isArray(data) ? data : (data.items || data.records || data.documents || []);
}

async function login(user) {
  const attempts = [
    { businessSlug, email: user.email, password: user.password },
    { business_slug: businessSlug, email: user.email, password: user.password },
  ];
  let last = null;
  for (const payload of attempts) {
    last = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (last.ok) break;
  }
  const body = unwrap(last?.body) || {};
  const token = body.token || body.accessToken || body.authToken || body.jwt || '';
  return { response: last, token, user: body.user || {}, business: body.business || {} };
}

const report = {
  audit: 'clinic-live-production-audit',
  version: 1,
  generatedAt: new Date().toISOString(),
  environment: { publicOrigin, backendOrigin, businessSlug },
  configuration: requiredConfiguration,
  health: {},
  users: [],
  checks: {},
  overall: 'FAIL',
  blockers: [],
};

for (const [key, path] of [['health', '/health'], ['database', '/api/v1/health/db']]) {
  try {
    const result = await request(path);
    report.health[key] = { status: result.status, pass: result.ok };
  } catch (error) {
    report.health[key] = { status: 0, pass: false, error: error.message };
  }
}

if (!requiredConfiguration.businessSlug || !requiredConfiguration.fiveUsersConfigured) {
  report.blockers.push('Clinic audit credentials are not fully configured in GitHub Actions secrets. No live PASS is permitted.');
} else {
  const criticalEndpoints = [
    '/api/v1/commercial/context',
    '/api/v1/auth/me',
    '/api/v1/clinic/dashboard',
    '/api/v1/clinic/patients?limit=5',
    '/api/v1/clinic/practitioners?limit=5',
    '/api/v1/clinic/appointments?limit=5',
    '/api/v1/clinic/queue?limit=5',
    '/api/v1/clinic/encounters?limit=5',
    '/api/v1/clinic/services?limit=5',
    '/api/v1/clinic/invoices?limit=5',
    '/api/v1/clinic/payments?limit=5',
    '/api/v1/clinic/notification-rules',
    '/api/v1/clinic/reports/summary',
  ];

  for (const user of users) {
    const result = { key: user.key, role: user.role, login: false, roleMatch: false, clinicTenant: false, endpoints: [], pass: false };
    try {
      const session = await login(user);
      result.login = Boolean(session.response?.ok && session.token);
      if (result.login) {
        const headers = { Authorization: `Bearer ${session.token}` };
        for (const path of criticalEndpoints) {
          const response = await request(path, { headers });
          result.endpoints.push({ path, status: response.status, pass: response.ok || response.status === 403 });
          if (path === '/api/v1/commercial/context' && response.ok) {
            const context = unwrap(response.body) || {};
            const code = String(context?.industry?.industry?.code || context?.business?.industryCode || context?.business?.industry?.code || '').toLowerCase();
            result.clinicTenant = code === 'clinic';
            const roles = context?.user?.roles || context?.access?.roles || session.user?.roles || [];
            result.roleMatch = Array.isArray(roles)
              ? roles.some((role) => String(role?.name || role).toLowerCase().includes(user.role.toLowerCase()))
              : String(roles || '').toLowerCase().includes(user.role.toLowerCase());
          }
        }
      }
    } catch (error) {
      result.error = error.message;
    }
    result.pass = result.login && result.clinicTenant && result.roleMatch && result.endpoints.every((entry) => entry.pass);
    report.users.push(result);
  }
}

report.checks = {
  backendHealthPass: Object.values(report.health).every((item) => item.pass),
  configurationComplete: Object.values(requiredConfiguration).every(Boolean),
  fiveIndependentUsers: report.users.length === 5,
  allRoleLoginsPass: report.users.length === 5 && report.users.every((user) => user.login),
  allRolesMatch: report.users.length === 5 && report.users.every((user) => user.roleMatch),
  clinicTenantIsolationGuard: report.users.length === 5 && report.users.every((user) => user.clinicTenant),
  criticalApiSurfacePass: report.users.length === 5 && report.users.every((user) => user.endpoints.every((entry) => entry.pass)),
};

report.overall = Object.values(report.checks).every(Boolean) ? 'PASS' : 'FAIL';

const runtime = {
  publicOrigin,
  backendOrigin,
  ids: { businessSlug },
  users,
  nonce: crypto.randomUUID(),
};

await fs.writeFile('clinic-live-audit-report.json', JSON.stringify(report, null, 2));
await fs.writeFile('clinic-live-audit-runtime.json', JSON.stringify(runtime, null, 2));
await fs.writeFile('clinic-live-audit-credentials.json', JSON.stringify({ businessSlug, users }, null, 2));
await fs.writeFile('clinic-live-audit-cleanup.sql', '-- Clinic audit uses a pre-provisioned disposable tenant. Add tenant-specific cleanup SQL after the first successful seeded run.\n');

console.log(JSON.stringify(report, null, 2));
if (report.overall !== 'PASS') process.exitCode = 1;
