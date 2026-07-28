import fs from "node:fs";
import path from "node:path";

const manifestPath = path.resolve("deployment/vercel-industry-projects.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const baseUrl = String(process.env.AXTOR_PUBLIC_ORIGIN || manifest.publicOrigin || "https://axtorpos.vercel.app").replace(/\/$/, "");
const backendUrl = String(process.env.AXTOR_BACKEND_ORIGIN || "https://axtor-cloud-pos-production.up.railway.app").replace(/\/$/, "");
const timeoutMs = Number(process.env.AXTOR_SMOKE_TIMEOUT_MS || 20000);

function result(name, status, detail = {}) {
  return { name, status, ...detail };
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      ...options,
      headers: {
        "User-Agent": "Axtor-Production-Smoke/1.0",
        Accept: "*/*",
        ...(options.headers || {})
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function localAssets(html, dashboardUrl) {
  const urls = new Set();
  const pattern = /(?:src|href)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const value = match[1].trim();
    if (!value || value.startsWith("#") || value.startsWith("data:") || value.startsWith("mailto:") || value.startsWith("javascript:")) continue;
    const resolved = new URL(value, dashboardUrl);
    if (resolved.origin !== new URL(dashboardUrl).origin) continue;
    if (!/\.(?:js|css|svg|png|jpg|jpeg|webp|json)(?:$|\?)/i.test(resolved.pathname + resolved.search)) continue;
    urls.add(resolved.toString());
  }
  return [...urls];
}

async function checkIndustry(project) {
  const dashboardUrl = `${baseUrl}/apps/${encodeURIComponent(project.industry)}/${encodeURIComponent(project.dashboard)}`;
  const response = await request(dashboardUrl, { headers: { Accept: "text/html" } });
  if (response.status !== 200) {
    return result(project.industry, "FAIL", { dashboardUrl, httpStatus: response.status, reason: `Dashboard returned HTTP ${response.status}` });
  }

  const servedIndustry = response.headers.get("x-axtor-industry");
  const servedBranch = response.headers.get("x-axtor-frontend-branch");
  if (servedIndustry !== project.industry) {
    return result(project.industry, "FAIL", { dashboardUrl, httpStatus: response.status, reason: `Expected X-Axtor-Industry ${project.industry}, received ${servedIndustry || "missing"}` });
  }
  if (servedBranch !== project.branch) {
    return result(project.industry, "FAIL", { dashboardUrl, httpStatus: response.status, reason: `Expected X-Axtor-Frontend-Branch ${project.branch}, received ${servedBranch || "missing"}` });
  }

  const html = await response.text();
  if (!html.trim().startsWith("<") || !/<html|<!doctype/i.test(html)) {
    return result(project.industry, "FAIL", { dashboardUrl, httpStatus: response.status, reason: "Dashboard response is not HTML" });
  }
  if (/industry\.html\?module=/i.test(html)) {
    return result(project.industry, "FAIL", { dashboardUrl, httpStatus: response.status, reason: "Dashboard contains a generic industry workspace route" });
  }

  const assets = localAssets(html, dashboardUrl);
  const assetChecks = [];
  for (const assetUrl of assets) {
    const assetResponse = await request(assetUrl);
    const assetIndustry = assetResponse.headers.get("x-axtor-industry");
    const assetBranch = assetResponse.headers.get("x-axtor-frontend-branch");
    const passed = assetResponse.status === 200 && assetIndustry === project.industry && assetBranch === project.branch;
    assetChecks.push({ url: assetUrl, status: assetResponse.status, passed });
    if (!passed) {
      return result(project.industry, "FAIL", {
        dashboardUrl,
        httpStatus: response.status,
        servedIndustry,
        servedBranch,
        reason: `Branch asset failed: ${assetUrl}`,
        assetChecks
      });
    }
  }

  return result(project.industry, "PASS", {
    dashboardUrl,
    httpStatus: response.status,
    servedIndustry,
    servedBranch,
    assetsVerified: assetChecks.length,
    assetChecks
  });
}

async function checkBackend(pathname, name) {
  const url = backendUrl + pathname;
  try {
    const response = await request(url, { headers: { Accept: "application/json" } });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
    return result(name, response.status === 200 ? "PASS" : "FAIL", { url, httpStatus: response.status, body });
  } catch (error) {
    return result(name, "FAIL", { url, reason: error instanceof Error ? error.message : String(error) });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  publicOrigin: baseUrl,
  backendOrigin: backendUrl,
  industries: [],
  backend: []
};

for (const project of manifest.projects) {
  process.stdout.write(`Checking ${project.industry}... `);
  try {
    const check = await checkIndustry(project);
    report.industries.push(check);
    console.log(check.status);
  } catch (error) {
    const check = result(project.industry, "FAIL", { reason: error instanceof Error ? error.message : String(error) });
    report.industries.push(check);
    console.log("FAIL");
  }
}

report.backend.push(await checkBackend("/health", "backend-http-health"));
report.backend.push(await checkBackend("/api/v1/health/db", "backend-database-health"));

const allChecks = [...report.industries, ...report.backend];
report.summary = {
  total: allChecks.length,
  passed: allChecks.filter(item => item.status === "PASS").length,
  failed: allChecks.filter(item => item.status === "FAIL").length,
  notVerified: allChecks.filter(item => item.status === "NOT VERIFIED").length
};

fs.writeFileSync("production-smoke-report.json", JSON.stringify(report, null, 2) + "\n");
console.table(allChecks.map(item => ({ check: item.name, status: item.status, httpStatus: item.httpStatus || "", branch: item.servedBranch || "" })));
console.log(`Production smoke summary: ${report.summary.passed}/${report.summary.total} passed`);

if (report.summary.failed > 0) process.exit(1);
