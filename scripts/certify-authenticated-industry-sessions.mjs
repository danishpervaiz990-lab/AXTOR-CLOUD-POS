import fs from "node:fs";

const backendOrigin = String(process.env.AXTOR_BACKEND_ORIGIN || "https://axtor-cloud-pos-production.up.railway.app").replace(/\/$/, "");
const publicOrigin = String(process.env.AXTOR_PUBLIC_ORIGIN || "https://axtorpos.vercel.app").replace(/\/$/, "");
const timeoutMs = Number(process.env.AXTOR_E2E_TIMEOUT_MS || 20000);
const rawAccounts = process.env.AXTOR_E2E_ACCOUNTS_JSON || (process.env.AXTOR_E2E_ACCOUNTS_FILE ? fs.readFileSync(process.env.AXTOR_E2E_ACCOUNTS_FILE, "utf8") : "");

if (!rawAccounts.trim()) {
  console.error("AXTOR_E2E_ACCOUNTS_JSON or AXTOR_E2E_ACCOUNTS_FILE is required.");
  process.exit(2);
}

let accounts;
try {
  accounts = JSON.parse(rawAccounts);
} catch (error) {
  console.error("Authenticated account configuration is not valid JSON.");
  process.exit(2);
}
if (!Array.isArray(accounts) || accounts.length === 0) {
  console.error("Authenticated account configuration must be a non-empty array.");
  process.exit(2);
}

const aliases = {
  general_retail: "retail",
  supermarket: "grocery",
  education: "school",
  garage: "workshop",
  distribution: "wholesale"
};

function normalizedIndustry(value) {
  const code = String(value || "").trim().toLowerCase();
  return aliases[code] || code;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 500); }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

function unwrap(value) {
  return value && Object.prototype.hasOwnProperty.call(value, "data") ? value.data : value;
}

function safeAccount(account, index) {
  const industry = normalizedIndustry(account.industry);
  if (!industry || !account.businessSlug || !account.email || !account.password) {
    throw new Error(`Account ${index + 1} requires industry, businessSlug, email, and password`);
  }
  return {
    label: String(account.label || `${industry}-${index + 1}`),
    industry,
    businessSlug: String(account.businessSlug),
    email: String(account.email),
    password: String(account.password),
    expectedRole: account.expectedRole ? String(account.expectedRole) : "",
    dashboard: String(account.dashboard || `${industry}-dashboard.html`),
    allowed: Array.isArray(account.allowed) ? account.allowed.map(String) : [],
    denied: Array.isArray(account.denied) ? account.denied.map(String) : []
  };
}

async function authenticatedGet(pathname, token) {
  return await request(backendOrigin + pathname, { headers: { Authorization: `Bearer ${token}` } });
}

async function certifyAccount(account, index) {
  const config = safeAccount(account, index);
  const checks = [];
  let token = "";

  const login = await request(backendOrigin + "/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ businessSlug: config.businessSlug, email: config.email, password: config.password })
  });
  checks.push({ check: "login", status: login.response.status });
  if (login.response.status !== 200) throw new Error(`Login returned HTTP ${login.response.status}`);
  token = String(login.body?.token || unwrap(login.body)?.token || "");
  if (!token) throw new Error("Login response did not return an access token");

  const [meResult, registryResult] = await Promise.all([
    authenticatedGet("/api/v1/auth/me", token),
    authenticatedGet("/api/v1/industry/registry", token)
  ]);
  checks.push({ check: "auth-me", status: meResult.response.status });
  checks.push({ check: "industry-registry", status: registryResult.response.status });
  if (meResult.response.status !== 200) throw new Error(`Auth context returned HTTP ${meResult.response.status}`);
  if (registryResult.response.status !== 200) throw new Error(`Industry registry returned HTTP ${registryResult.response.status}`);

  const me = unwrap(meResult.body) || meResult.body || {};
  const registry = unwrap(registryResult.body) || registryResult.body || {};
  const actualIndustry = normalizedIndustry(registry.selection?.code || registry.selected?.code || me.business?.industryCode || me.business?.industry);
  if (actualIndustry !== config.industry) throw new Error(`Expected industry ${config.industry}, received ${actualIndustry || "missing"}`);
  const actualRole = String(me.user?.role || me.role || "");
  if (config.expectedRole && actualRole.toLowerCase() !== config.expectedRole.toLowerCase()) {
    throw new Error(`Expected role ${config.expectedRole}, received ${actualRole || "missing"}`);
  }

  const dashboardUrl = `${publicOrigin}/apps/${encodeURIComponent(config.industry)}/${encodeURIComponent(config.dashboard)}`;
  const dashboard = await request(dashboardUrl, { headers: { Accept: "text/html" } });
  checks.push({ check: "frontend-dashboard", status: dashboard.response.status });
  if (dashboard.response.status !== 200) throw new Error(`Frontend dashboard returned HTTP ${dashboard.response.status}`);
  if (dashboard.response.headers.get("x-axtor-industry") !== config.industry) throw new Error("Frontend industry header mismatch");
  if (dashboard.response.headers.get("x-axtor-frontend-branch") !== `frontend-${config.industry}`) throw new Error("Frontend branch header mismatch");

  for (const pathname of config.allowed) {
    const allowed = await authenticatedGet(pathname, token);
    checks.push({ check: `allowed:${pathname}`, status: allowed.response.status });
    if (allowed.response.status < 200 || allowed.response.status >= 300) {
      throw new Error(`Allowed endpoint ${pathname} returned HTTP ${allowed.response.status}`);
    }
  }

  for (const pathname of config.denied) {
    const denied = await authenticatedGet(pathname, token);
    checks.push({ check: `denied:${pathname}`, status: denied.response.status });
    if (![401, 403, 404].includes(denied.response.status)) {
      throw new Error(`Denied endpoint ${pathname} unexpectedly returned HTTP ${denied.response.status}`);
    }
  }

  const logout = await request(backendOrigin + "/api/v1/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({})
  });
  checks.push({ check: "logout", status: logout.response.status });
  if (logout.response.status !== 200) throw new Error(`Logout returned HTTP ${logout.response.status}`);

  const afterLogout = await authenticatedGet("/api/v1/auth/me", token);
  checks.push({ check: "revoked-session", status: afterLogout.response.status });
  if (afterLogout.response.status !== 401) throw new Error(`Revoked token remained active with HTTP ${afterLogout.response.status}`);

  return {
    label: config.label,
    industry: config.industry,
    role: actualRole,
    status: "PASS",
    dashboardUrl,
    checks
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  backendOrigin,
  publicOrigin,
  accounts: []
};

for (let index = 0; index < accounts.length; index += 1) {
  const source = accounts[index];
  const label = String(source?.label || source?.industry || `account-${index + 1}`);
  process.stdout.write(`Certifying ${label}... `);
  try {
    const accountReport = await certifyAccount(source, index);
    report.accounts.push(accountReport);
    console.log("PASS");
  } catch (error) {
    report.accounts.push({
      label,
      industry: normalizedIndustry(source?.industry),
      expectedRole: source?.expectedRole || "",
      status: "FAIL",
      reason: error instanceof Error ? error.message : String(error)
    });
    console.log("FAIL");
  }
}

report.summary = {
  total: report.accounts.length,
  passed: report.accounts.filter(item => item.status === "PASS").length,
  failed: report.accounts.filter(item => item.status === "FAIL").length
};

fs.writeFileSync("authenticated-e2e-report.json", JSON.stringify(report, null, 2) + "\n");
console.table(report.accounts.map(item => ({ label: item.label, industry: item.industry, role: item.role || item.expectedRole || "", status: item.status, reason: item.reason || "" })));
console.log(`Authenticated certification: ${report.summary.passed}/${report.summary.total} passed`);
if (report.summary.failed > 0) process.exit(1);
