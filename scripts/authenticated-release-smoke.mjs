import assert from "node:assert/strict";
import fs from "node:fs";

const API_BASE = String(process.env.AXTOR_API_URL || "https://axtor-cloud-pos-production.up.railway.app").replace(/\/$/, "");
const FRONTEND_BASE = String(process.env.AXTOR_FRONTEND_URL || "https://axtorpos.vercel.app").replace(/\/$/, "");
const REQUIRE_ALL = String(process.env.AXTOR_E2E_REQUIRE_ALL_INDUSTRIES || "false").toLowerCase() === "true";
const manifest = JSON.parse(fs.readFileSync("deployment/vercel-industry-projects.json", "utf8"));
const releases = new Map(manifest.projects.map((item) => [item.industry, item]));

function normalizeIndustry(raw) {
  const code = String(raw || "").trim().toLowerCase();
  const aliases = {
    general_retail: "retail",
    supermarket: "grocery",
    education: "school",
    garage: "workshop",
    distribution: "wholesale"
  };
  return aliases[code] || code;
}

function redactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]");
}

async function request(url, options = {}) {
  const response = await fetch(url, { redirect: "manual", cache: "no-store", ...options });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* HTML or text response */ }
  return { response, text, json };
}

function payloadData(payload) {
  return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
}

function readAccounts() {
  const raw = String(process.env.AXTOR_E2E_ACCOUNTS_JSON || "").trim();
  if (raw) {
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed) && parsed.length, "AXTOR_E2E_ACCOUNTS_JSON must be a non-empty JSON array");
    return parsed;
  }
  const businessSlug = String(process.env.AXTOR_E2E_BUSINESS_SLUG || "").trim();
  const email = String(process.env.AXTOR_E2E_EMAIL || "").trim();
  const password = String(process.env.AXTOR_E2E_PASSWORD || "");
  if (!businessSlug || !email || !password) {
    throw new Error("No E2E credentials supplied. Configure AXTOR_E2E_ACCOUNTS_JSON or the single-account AXTOR_E2E_* variables.");
  }
  return [{
    name: process.env.AXTOR_E2E_ACCOUNT_NAME || email,
    businessSlug,
    email,
    password,
    expectedIndustry: process.env.AXTOR_E2E_EXPECTED_INDUSTRY || "",
    expectedRole: process.env.AXTOR_E2E_EXPECTED_ROLE || ""
  }];
}

async function login(account) {
  const { response, json } = await request(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      businessSlug: account.businessSlug,
      email: account.email,
      password: account.password
    })
  });
  assert.equal(response.status, 200, `${account.name}: login returned ${response.status}`);
  assert.ok(json?.token, `${account.name}: login response has no access token`);
  return json.token;
}

async function authenticatedJson(account, token, path, options = {}) {
  const { response, json, text } = await request(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`${account.name}: ${path} returned ${response.status}: ${json?.error?.message || text.slice(0, 180)}`);
  return payloadData(json);
}

async function verifyFrontend(account, industry, release) {
  const path = `/apps/${encodeURIComponent(industry)}/${release.dashboard}`;
  assert.doesNotMatch(path, /[?&](token|code)=/i, `${account.name}: credential material appeared in workspace URL`);
  const { response, text } = await request(`${FRONTEND_BASE}${path}`);
  assert.equal(response.status, 200, `${account.name}: workspace returned ${response.status}`);
  assert.match(String(response.headers.get("content-type") || ""), /text\/html/i, `${account.name}: workspace is not HTML`);
  assert.equal(response.headers.get("x-axtor-industry"), industry, `${account.name}: proxy industry header mismatch`);
  assert.equal(response.headers.get("x-axtor-frontend-branch"), release.branch, `${account.name}: proxy branch header mismatch`);
  assert.doesNotMatch(text, /industry\.html\?module=/i, `${account.name}: dedicated dashboard links to generic workspace`);

  const localAssets = [...text.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi)]
    .map((match) => match[1])
    .filter((value) => !/^https?:\/\//i.test(value))
    .slice(0, 6);
  assert.ok(localAssets.length, `${account.name}: dashboard contains no local JS/CSS assets`);
  for (const asset of localAssets) {
    const assetUrl = new URL(asset, `${FRONTEND_BASE}${path}`).toString();
    const result = await request(assetUrl);
    assert.equal(result.response.status, 200, `${account.name}: asset ${asset} returned ${result.response.status}`);
  }
}

async function verifyForbiddenChecks(account, token) {
  const checks = Array.isArray(account.forbidden) ? account.forbidden : [];
  for (const check of checks) {
    const method = String(check.method || "GET").toUpperCase();
    const { response } = await request(`${API_BASE}${check.path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(check.body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: check.body === undefined ? undefined : JSON.stringify(check.body)
    });
    const allowed = Array.isArray(check.expectedStatuses) ? check.expectedStatuses : [403];
    assert.ok(allowed.includes(response.status), `${account.name}: forbidden check ${method} ${check.path} returned ${response.status}, expected ${allowed.join("/")}`);
  }
}

async function verifyAccount(account) {
  assert.ok(account.name && account.businessSlug && account.email && account.password, "Every E2E account requires name, businessSlug, email, and password");
  console.log(`E2E ${account.name}: authenticating`);
  const token = await login(account);
  try {
    const [me, registry] = await Promise.all([
      authenticatedJson(account, token, "/api/v1/auth/me"),
      authenticatedJson(account, token, "/api/v1/industry/registry")
    ]);
    const rawIndustry = registry?.selection?.code || registry?.selected?.code || me?.business?.industryCode || me?.business?.industry;
    const industry = normalizeIndustry(rawIndustry);
    assert.ok(industry, `${account.name}: canonical industry is missing`);
    if (account.expectedIndustry) assert.equal(industry, normalizeIndustry(account.expectedIndustry), `${account.name}: industry mismatch`);
    const release = releases.get(industry);
    assert.ok(release, `${account.name}: ${industry} has no certified frontend release`);

    const actualRole = String(me?.user?.role || "").toLowerCase();
    if (account.expectedRole) assert.equal(actualRole, String(account.expectedRole).toLowerCase(), `${account.name}: role mismatch`);

    await verifyFrontend(account, industry, release);
    await verifyForbiddenChecks(account, token);
    console.log(`PASS ${account.name}: ${industry} -> ${release.branch}/${release.dashboard}`);
    return industry;
  } finally {
    await request(`${API_BASE}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
    }).catch(() => undefined);
  }
}

async function main() {
  const accounts = readAccounts();
  const passedIndustries = new Set();
  for (const account of accounts) {
    try {
      passedIndustries.add(await verifyAccount(account));
    } catch (error) {
      console.error(`FAIL ${account.name || "unnamed account"}: ${redactError(error)}`);
      process.exitCode = 1;
    }
  }
  if (REQUIRE_ALL) {
    const missing = [...releases.keys()].filter((industry) => !passedIndustries.has(industry));
    assert.deepEqual(missing, [], `Missing authenticated coverage for: ${missing.join(", ")}`);
  }
  if (process.exitCode) return;
  console.log(`PASS: ${accounts.length} authenticated account(s), ${passedIndustries.size} certified industry route(s)`);
}

main().catch((error) => {
  console.error(`FATAL: ${redactError(error)}`);
  process.exitCode = 1;
});
