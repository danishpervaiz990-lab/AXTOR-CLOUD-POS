export const runtime = "edge";
export const config = { runtime: "edge" };

const FRONTEND = "https://axtor-grocery-pos-production.up.railway.app";
const BACKEND = "https://axtor-cloud-pos-production.up.railway.app";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Axtor-Industry": "grocery",
      "X-Axtor-Probe": "replacement-live-certification"
    }
  });
}

async function read(response) {
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  return { text, parsed };
}

async function backendJson(path, options = {}) {
  const response = await fetch(BACKEND + path, {
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Backend ${path} -> HTTP ${response.status}: ${payload?.message || payload?.error?.message || payload?.error || "request failed"}`);
  }
  return payload?.data ?? payload;
}

function makePassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `GroceryCutover!${token}9aA`;
}

function sessionCookieHeader(raw) {
  const cookies = [];
  for (const name of ["axtorGroceryAuthToken", "axtorGroceryBusinessId"]) {
    const match = raw.match(new RegExp(`${name}=([^;,\\s]+)`));
    if (match) cookies.push(`${name}=${match[1]}`);
  }
  return cookies.join("; ");
}

export default async function groceryLiveProbe(request) {
  if (request.method !== "GET") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  const checks = {};
  try {
    const healthResponse = await fetch(FRONTEND + "/api/health", { cache: "no-store", redirect: "manual" });
    const health = await read(healthResponse);
    checks.health = { status: healthResponse.status, helloOnly: /^\s*hello\s*$/i.test(health.text) };
    if (healthResponse.status !== 200 || checks.health.helloOnly) throw new Error("Replacement Grocery health endpoint is not live");

    const loginResponse = await fetch(FRONTEND + "/login", { cache: "no-store", redirect: "manual" });
    const loginPage = await read(loginResponse);
    checks.loginPage = {
      status: loginResponse.status,
      hasGroceryBrand: loginPage.text.includes("AXTOR Grocery"),
      hasWorkspaceHeading: loginPage.text.includes("Enter your grocery workspace."),
      helloOnly: /^\s*hello\s*$/i.test(loginPage.text)
    };
    if (loginResponse.status !== 200 || !checks.loginPage.hasGroceryBrand || !checks.loginPage.hasWorkspaceHeading || checks.loginPage.helloOnly) {
      throw new Error("Replacement Grocery login UI is not live");
    }

    const catalog = await backendJson("/api/v1/public/catalog");
    const plans = Array.isArray(catalog?.plans) ? catalog.plans : [];
    const plan = plans.find(item => String(item.code || "").toLowerCase() === "professional")
      || plans.find(item => item.isRecommended)
      || plans[0];
    if (!plan?.code) throw new Error("No active plan found for Grocery live certification");

    const tag = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const email = `grocery.live.probe.${tag}@example.test`;
    const password = makePassword();
    const registration = await backendJson("/api/v1/public/register", {
      method: "POST",
      headers: { "Idempotency-Key": `grocery-live-probe:${tag}` },
      body: JSON.stringify({
        businessName: `Grocery Live Probe ${tag}`,
        ownerName: "Grocery Live Probe Owner",
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
        acceptPrivacy: true
      })
    });
    const workspace = String(registration?.business?.slug || "").trim();
    if (!workspace) throw new Error("Grocery live probe tenant registration returned no workspace");
    checks.temporaryTenant = { created: true, industry: "grocery" };

    const frontendLogin = await fetch(FRONTEND + "/api/auth/login", {
      method: "POST",
      redirect: "manual",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: FRONTEND,
        Referer: FRONTEND + "/login"
      },
      body: JSON.stringify({ workspace, email, password })
    });
    const loginResult = await read(frontendLogin);
    const rawCookies = frontendLogin.headers.get("set-cookie") || "";
    const cookie = sessionCookieHeader(rawCookies);
    checks.frontendLogin = {
      status: frontendLogin.status,
      sharedSessionCookies: cookie.includes("axtorGroceryAuthToken=") && cookie.includes("axtorGroceryBusinessId=")
    };
    if (frontendLogin.status !== 200 || !checks.frontendLogin.sharedSessionCookies) {
      throw new Error(`Replacement Grocery frontend login failed: HTTP ${frontendLogin.status} ${loginResult.text.slice(0, 120)}`);
    }

    const pages = [
      ["/dashboard", "Grocery operations"],
      ["/checkout", "AXTOR Grocery"],
      ["/inventory", "AXTOR Grocery"],
      ["/finance", "AXTOR Grocery"],
      ["/cheques", "AXTOR Grocery"]
    ];
    checks.pages = {};
    for (const [path, marker] of pages) {
      const response = await fetch(FRONTEND + path, {
        cache: "no-store",
        redirect: "manual",
        headers: { Cookie: cookie }
      });
      const page = await read(response);
      checks.pages[path] = {
        status: response.status,
        replacementMarker: page.text.includes(marker),
        legacyDbFailure: /LOCAL_GROCERY_DATABASE_DISABLED_USE_SHARED_BACKEND|Internal Server Error/i.test(page.text)
      };
      if (response.status !== 200 || !checks.pages[path].replacementMarker || checks.pages[path].legacyDbFailure) {
        throw new Error(`Replacement Grocery page failed: ${path}`);
      }
    }

    const gateway = await fetch("https://axtorpos.vercel.app/apps/grocery", { cache: "no-store", redirect: "manual" });
    const location = gateway.headers.get("location") || "";
    checks.existingGroceryGateway = {
      status: gateway.status,
      targetsReplacement: location.startsWith(FRONTEND + "/login")
    };
    if (![307, 308].includes(gateway.status) || !checks.existingGroceryGateway.targetsReplacement) {
      throw new Error("Existing AXTOR Grocery gateway is not targeting the replacement Grocery app");
    }

    return json({
      ok: true,
      result: "GROCERY_REPLACEMENT_LIVE_CERTIFICATION_PASS",
      frontend: FRONTEND,
      checks
    });
  } catch (error) {
    return json({
      ok: false,
      result: "GROCERY_REPLACEMENT_LIVE_CERTIFICATION_FAIL",
      frontend: FRONTEND,
      error: error?.message || String(error),
      checks
    }, 500);
  }
}
