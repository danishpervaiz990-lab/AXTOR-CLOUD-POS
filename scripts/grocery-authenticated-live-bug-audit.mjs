import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";

const frontend = String(process.env.FRONTEND || "https://axtorpos.vercel.app/apps/grocery").replace(/\/$/, "");
const backend = String(process.env.BACKEND || "https://axtor-cloud-pos-production.up.railway.app").replace(/\/$/, "");
const fatalBody = /LOCAL_GROCERY_DATABASE_DISABLED_USE_SHARED_BACKEND|Application not found|Internal Server Error|Cannot connect to the shared AXTOR backend|Cannot connect to the AXTOR backend|Route not found:/i;
const reportPath = "grocery-live-bug-audit-report.json";
const screenshotPath = "grocery-live-bug-audit.png";

const report = {
  generatedAt: new Date().toISOString(),
  production: { frontend, backend },
  authenticated: false,
  industry: null,
  phase: "starting",
  apiResults: [],
  navigationViews: [],
  dashboardFormatting: "PENDING",
  mobileDrawer: "PENDING",
  liveCheque: { api: false, upcoming: false, reminder: false, displayed: false },
  errors: { pageErrors: [], consoleErrors: [], failedRequests: [], badResponses: [] },
  overall: "FAIL",
};

function saveReport() {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

async function api(path, { method = "GET", body, headers = {}, expected = [200] } = {}) {
  const response = await fetch(backend + path, {
    method,
    cache: "no-store",
    headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json().catch(() => null);
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} HTTP ${response.status}: ${json?.error?.message || json?.message || json?.error || "failed"}`);
  }
  return { status: response.status, data: json?.data ?? json };
}

function unique(items) {
  return [...new Set(items.map(String))];
}

function relevantConsole(message) {
  return !/favicon|ERR_ABORTED/i.test(message);
}

function relevantFailed(request) {
  const url = request.url();
  const errorText = String(request.failure()?.errorText || "");
  return !/favicon|robots\.txt/i.test(url) && !/ERR_ABORTED/i.test(errorText);
}

async function waitForView(page, view) {
  await page.waitForFunction(targetView => {
    const current = new URL(location.href).searchParams.get("view") || "dashboard";
    const heading = String(document.querySelector("h1")?.textContent || "").trim();
    if (current !== targetView || !heading) return false;
    return targetView === "dashboard" ? heading === "Grocery Dashboard" : heading !== "Grocery Dashboard";
  }, view, { timeout: 20000 });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
}

async function assertCurrentViewHealthy(page, view) {
  const body = await page.locator("body").innerText();
  const notice = await page.locator(".notice-error").allInnerTexts();
  const heading = await page.locator("h1").first().innerText().catch(() => "");
  if (fatalBody.test(body)) throw new Error(`${view}: fatal runtime message detected`);
  if (notice.length) throw new Error(`${view}: visible error notice: ${notice.join(" | ")}`);
  if (!heading.trim()) throw new Error(`${view}: no page heading rendered`);
  if (view !== "dashboard" && heading.trim() === "Grocery Dashboard") throw new Error(`${view}: fell back to Grocery Dashboard`);
  return heading.trim();
}

let browser;
let context;
let page;
try {
  report.phase = "registration";
  saveReport();
  const catalog = (await api("/api/v1/public/catalog")).data;
  const plans = Array.isArray(catalog?.plans) ? catalog.plans : [];
  const plan = plans.find(p => String(p.code || "").toLowerCase() === "professional") || plans.find(p => p.isRecommended) || plans[0];
  if (!plan?.code) throw new Error("No active public plan available for live Grocery QA registration");

  const tag = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const email = `grocery.live.audit.${tag}@example.test`;
  const password = `GroceryLive!${crypto.randomBytes(18).toString("base64url")}9aA`;
  const registration = (await api("/api/v1/public/register", {
    method: "POST",
    expected: [200, 201],
    headers: { "Idempotency-Key": `grocery-live-audit:${tag}` },
    body: {
      businessName: `Grocery Live Audit ${tag}`,
      ownerName: "Grocery Live Audit Owner",
      email,
      password,
      country: "QA",
      timezone: "Asia/Qatar",
      baseCurrency: "QAR",
      language: "en",
      industryCode: "grocery",
      planCode: String(plan.code).toLowerCase(),
      billingCycle: "MONTHLY",
      firstBranch: "Main Branch",
      firstWarehouse: "Main Warehouse",
      firstCounter: "Counter 1",
      taxSystem: "none",
      taxLabel: "Tax",
      invoicePrefix: "GRC",
      printProfile: "a4",
      pricesIncludeTax: false,
      sampleDataRequested: false,
      acceptTerms: true,
      acceptPrivacy: true,
    },
  })).data;
  const workspace = String(registration?.business?.slug || "").trim();
  if (!workspace) throw new Error("Registration returned no Grocery workspace slug");
  report.production.workspace = workspace;
  saveReport();

  report.phase = "browser-login";
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.on("pageerror", error => report.errors.pageErrors.push(error.stack || error.message));
  page.on("console", message => {
    if (message.type() === "error" && relevantConsole(message.text())) report.errors.consoleErrors.push(message.text());
  });
  page.on("requestfailed", request => {
    if (relevantFailed(request)) report.errors.failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`);
  });
  page.on("response", response => {
    if (response.status() >= 500) report.errors.badResponses.push(`${response.status()} ${response.url()}`);
  });

  const entry = await page.goto(frontend, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (!entry || entry.status() !== 200) throw new Error(`Grocery entry returned HTTP ${entry?.status()}`);
  await page.locator('input[name="workspace"]').waitFor({ timeout: 20000 });
  await page.locator('input[name="workspace"]').fill(workspace);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await page.getByRole("heading", { name: "Grocery Dashboard" }).waitFor({ timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const token = await page.evaluate(() => localStorage.getItem("axtorAuthToken"));
  if (!token) throw new Error("Live Grocery UI login did not persist auth token");
  report.authenticated = true;
  const auth = { Authorization: `Bearer ${token}` };

  const dashboardText = await page.locator("body").innerText();
  if (dashboardText.includes('<span class="p50-compare-') || dashboardText.includes("&lt;span class=&quot;p50-compare-")) {
    throw new Error("Dashboard still renders comparison HTML as literal text");
  }
  report.dashboardFormatting = "PASS";

  report.phase = "authenticated-api";
  saveReport();
  const apiChecks = [
    "/api/v1/auth/me",
    "/api/v1/industry/registry",
    "/api/v1/grocery/context",
    "/api/v1/dashboard/summary",
    "/api/v1/grocery/ageing?scope=customer",
    "/api/v1/grocery/ageing?scope=supplier",
    "/api/v1/grocery/expiry?window=30",
    "/api/v1/purchases?limit=50",
    "/api/v1/customers?limit=50",
    "/api/v1/suppliers?limit=50",
    "/api/v1/products?limit=50",
    "/api/v1/sales-documents?limit=50",
    "/api/v1/payments?limit=50",
    "/api/v1/accounts?active=true",
    "/api/v1/grocery/cheques",
  ];
  for (const path of apiChecks) {
    const result = await api(path, { headers: auth, expected: [200] });
    report.apiResults.push({ path, status: result.status });
  }
  const me = (await api("/api/v1/auth/me", { headers: auth })).data;
  const industry = String(me?.business?.industryCode || me?.business?.industry?.code || "").toLowerCase();
  if (industry !== "grocery") throw new Error(`Live QA tenant resolved as ${industry || "unknown"}, expected grocery`);
  report.industry = industry;

  report.phase = "live-cheque-api";
  saveReport();
  let accounts = (await api("/api/v1/accounts?active=true", { headers: auth })).data;
  accounts = Array.isArray(accounts) ? accounts : (Array.isArray(accounts?.accounts) ? accounts.accounts : []);
  let account = accounts.find(item => item.active !== false) || accounts[0];
  if (!account?.id) {
    account = (await api("/api/v1/accounts", {
      method: "POST",
      expected: [200, 201],
      headers: { ...auth, "Idempotency-Key": `grocery-live-account:${tag}` },
      body: { name: "Live QA Bank", type: "bank", bankName: "AXTOR Test Bank", currency: "QAR", openingBalance: 0, active: true },
    })).data;
  }
  if (!account?.id) throw new Error("Could not resolve payment account for cheque live test");

  const now = new Date();
  const due = new Date(now.getTime() + 7 * 86400000);
  const chequeNumber = `LIVE-QA-${tag}`;
  await api("/api/v1/grocery/cheques", {
    method: "POST",
    expected: [200, 201],
    headers: { ...auth, "Idempotency-Key": `grocery-live-cheque:${tag}` },
    body: {
      direction: "inward",
      paymentAccountId: account.id,
      chequeNumber,
      bankName: "AXTOR Test Bank",
      amount: 125.50,
      currencyCode: "QAR",
      chequeDate: now.toISOString(),
      dueDate: due.toISOString(),
      notes: "Authenticated live Grocery bug audit",
    },
  });
  const reminders = (await api("/api/v1/grocery/cheques/reminders/generate", {
    method: "POST",
    expected: [200, 201],
    headers: auth,
    body: { days: 30 },
  })).data;
  const chequeList = (await api("/api/v1/grocery/cheques", { headers: auth })).data;
  const cheques = Array.isArray(chequeList?.cheques) ? chequeList.cheques : (Array.isArray(chequeList) ? chequeList : []);
  if (!cheques.some(cheque => cheque.chequeNumber === chequeNumber)) throw new Error("Live-created cheque is missing from Grocery cheque API");
  report.liveCheque.api = true;
  if (Number(chequeList?.summary?.dueWithin30Days || 0) < 1) throw new Error("Cheque upcoming tally did not include live-created cheque");
  report.liveCheque.upcoming = true;
  if (Number(reminders?.created || 0) + Number(reminders?.unchanged || 0) < 1) throw new Error("Cheque reminder generation produced no evidence");
  report.liveCheque.reminder = true;

  report.phase = "navigation-sweep";
  saveReport();
  const navEntries = await page.$$eval("#side-nav [data-nav]", elements => {
    const seen = new Set();
    return elements.map(element => ({ view: element.dataset.nav, label: String(element.textContent || "").trim() }))
      .filter(entry => entry.view && !seen.has(entry.view) && seen.add(entry.view));
  });
  if (navEntries.length < 10) throw new Error(`Only ${navEntries.length} Grocery navigation views discovered`);

  for (const entry of navEntries) {
    const locator = page.locator(`#side-nav [data-nav="${entry.view}"]`).first();
    await locator.waitFor({ state: "visible", timeout: 10000 });
    await locator.click();
    await waitForView(page, entry.view);
    const heading = await assertCurrentViewHealthy(page, entry.view);
    report.navigationViews.push({ view: entry.view, label: entry.label, heading });
    saveReport();
  }

  report.phase = "cheque-ui";
  saveReport();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const chequeNav = page.locator('#side-nav [data-nav="cheques"]').first();
  await chequeNav.waitFor({ state: "visible", timeout: 10000 });
  await chequeNav.click();
  await waitForView(page, "cheques");
  await page.getByRole("heading", { name: "Cheque Management" }).waitFor({ timeout: 15000 });
  await page.getByText(chequeNumber, { exact: false }).waitFor({ timeout: 15000 });
  report.liveCheque.displayed = true;

  report.phase = "mobile-drawer";
  saveReport();
  await page.setViewportSize({ width: 412, height: 915 });
  await page.locator("#mobile-menu").click();
  await page.locator("#side-nav.open").waitFor({ timeout: 5000 });
  await page.locator(".grocery-nav-backdrop.open").click({ position: { x: 5, y: 5 } });
  await page.waitForFunction(() => !document.querySelector("#side-nav")?.classList.contains("open"));
  await page.locator("#mobile-menu").click();
  await page.locator(".grocery-nav-close").click();
  await page.waitForFunction(() => !document.querySelector("#side-nav")?.classList.contains("open"));
  await page.locator("#mobile-menu").click();
  await page.locator("#side-nav [data-nav]").first().click();
  await page.waitForFunction(() => !document.querySelector("#side-nav")?.classList.contains("open"));
  report.mobileDrawer = "PASS";

  report.phase = "final-error-scan";
  const finalErrors = {
    pageErrors: unique(report.errors.pageErrors),
    consoleErrors: unique(report.errors.consoleErrors),
    failedRequests: unique(report.errors.failedRequests),
    badResponses: unique(report.errors.badResponses),
  };
  report.errors = finalErrors;
  const errorCount = Object.values(finalErrors).reduce((count, values) => count + values.length, 0);
  report.overall = errorCount === 0 ? "PASS" : "FAIL";
  report.phase = "complete";
  saveReport();
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    overall: report.overall,
    apiChecks: report.apiResults.length,
    views: report.navigationViews.length,
    errorCount,
    dashboardFormatting: report.dashboardFormatting,
    mobileDrawer: report.mobileDrawer,
    liveCheque: report.liveCheque,
  }, null, 2));
  if (errorCount) throw new Error(`Live Grocery audit found ${errorCount} browser/network/runtime error(s)`);
} catch (error) {
  report.failure = error?.message || String(error);
  report.overall = "FAIL";
  saveReport();
  if (page) await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  console.error(error?.stack || error);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}
