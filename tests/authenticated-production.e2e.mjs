import { chromium } from "playwright";
import assert from "node:assert/strict";

const frontendBase = String(process.env.AXTOR_FRONTEND_BASE || "https://axtorpos.vercel.app").replace(/\/$/, "");
const backendBase = String(process.env.AXTOR_BACKEND_BASE || "https://axtor-cloud-pos-production.up.railway.app").replace(/\/$/, "");
const rawAccounts = process.env.AXTOR_E2E_ACCOUNTS_JSON;

if (!rawAccounts) throw new Error("AXTOR_E2E_ACCOUNTS_JSON is required");
const accounts = JSON.parse(rawAccounts);
assert.ok(Array.isArray(accounts) && accounts.length > 0, "At least one E2E account is required");

const aliases = { general_retail: "retail", education: "school", garage: "workshop", distribution: "wholesale", supermarket: "grocery" };
const normalize = value => aliases[String(value || "").toLowerCase()] || String(value || "").toLowerCase();
const expectedDashboard = industry => `${industry}-dashboard.html`;

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const account of accounts) {
    const label = String(account.name || `${account.industry}-${account.role || account.email}`);
    const industry = normalize(account.industry);
    assert.match(industry, /^(retail|grocery|pharmacy|gym|school|clinic|restaurant|hardware|paint|furniture|workshop|wholesale)$/);

    const login = await jsonRequest(`${backendBase}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ businessSlug: account.businessSlug, email: account.email, password: account.password })
    });
    assert.equal(login.response.status, 200, `${label}: login failed (${login.response.status})`);
    const token = login.payload?.token || login.payload?.data?.token;
    assert.ok(token, `${label}: login response has no token`);

    const authHeaders = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    const [me, registry] = await Promise.all([
      jsonRequest(`${backendBase}/api/v1/auth/me`, { headers: authHeaders }),
      jsonRequest(`${backendBase}/api/v1/industry/registry`, { headers: authHeaders })
    ]);
    assert.equal(me.response.status, 200, `${label}: auth/me failed`);
    assert.equal(registry.response.status, 200, `${label}: industry registry failed`);

    const selected = normalize(registry.payload?.data?.selection?.code || registry.payload?.selection?.code || registry.payload?.data?.selected?.code || registry.payload?.selected?.code || me.payload?.business?.industryCode || me.payload?.data?.business?.industryCode);
    assert.equal(selected, industry, `${label}: backend industry mismatch (${selected})`);

    for (const check of account.apiChecks || []) {
      const method = String(check.method || "GET").toUpperCase();
      const headers = { ...authHeaders };
      if (check.body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(`${backendBase}${check.path}`, {
        method,
        headers,
        body: check.body === undefined ? undefined : JSON.stringify(check.body)
      });
      const expected = Array.isArray(check.expectedStatus) ? check.expectedStatus : [check.expectedStatus];
      assert.ok(expected.includes(response.status), `${label}: ${method} ${check.path} returned ${response.status}; expected ${expected.join("/")}`);
    }

    const context = await browser.newContext({ ignoreHTTPSErrors: false });
    const page = await context.newPage();
    page.on("pageerror", error => console.error(`[${label}] browser error: ${error.message}`));

    await page.goto(`${frontendBase}/login.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(value => localStorage.setItem("axtorAuthToken", value), token);
    await page.goto(`${frontendBase}/router.html`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(url => url.pathname.includes(`/apps/${industry}/`), { timeout: 30000 });

    const current = new URL(page.url());
    assert.equal(current.origin, new URL(frontendBase).origin, `${label}: router left the public production origin`);
    assert.equal(current.pathname, `/apps/${industry}/${account.dashboard || expectedDashboard(industry)}`, `${label}: wrong dashboard route`);

    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    const html = await page.content();
    assert.doesNotMatch(html, /industry\.html\?module=/i, `${label}: generic industry workspace detected`);
    assert.doesNotMatch(html, /Vercel Authentication|sso-api/i, `${label}: protected preview destination detected`);

    const branchHeader = await page.evaluate(async () => {
      const response = await fetch(location.pathname, { method: "HEAD", cache: "no-store" });
      return { branch: response.headers.get("x-axtor-frontend-branch"), industry: response.headers.get("x-axtor-industry"), status: response.status };
    });
    assert.equal(branchHeader.status, 200, `${label}: dashboard HEAD failed`);
    assert.equal(branchHeader.branch, `frontend-${industry}`, `${label}: wrong source branch header`);
    assert.equal(branchHeader.industry, industry, `${label}: wrong industry header`);

    const localLinks = await page.$$eval("a[href]", anchors => anchors.map(a => a.getAttribute("href")).filter(Boolean).filter(href => !href.startsWith("http") && !href.startsWith("#") && !href.startsWith("mailto:")));
    assert.ok(localLinks.length > 0, `${label}: dedicated navigation has no local links`);
    for (const href of localLinks.slice(0, Number(account.navigationChecks || 3))) {
      const target = new URL(href, page.url());
      assert.ok(target.pathname.startsWith(`/apps/${industry}/`) || ["/login.html", "/router.html"].includes(target.pathname), `${label}: cross-industry or generic navigation target ${target.pathname}`);
      const response = await page.request.get(target.toString(), { failOnStatusCode: false });
      assert.ok(response.status() < 400, `${label}: navigation target failed ${target.pathname} (${response.status()})`);
    }

    await page.screenshot({ path: `artifacts/${label.replace(/[^A-Za-z0-9_.-]/g, "-")}.png`, fullPage: true });
    await context.close();
    results.push({ account: label, industry, role: account.role || "unspecified", status: "PASS" });
    console.log(`PASS ${label}: ${industry} ${account.role || "role"}`);
  }
} finally {
  await browser.close();
}

console.table(results);
console.log(`PASS: ${results.length} authenticated tenant-role journeys certified`);
