import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const manifest = JSON.parse(fs.readFileSync("deployment/vercel-industry-projects.json", "utf8"));
const certificationRefs = { manufacturing: "fix/manufacturing/dedicated-frontend-v1" };

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function show(branch, file) { return run("git", ["show", `origin/${branch}:${file}`]); }

const frontendRefs = manifest.projects.filter(item => item.industry !== "grocery").map(item => certificationRefs[item.industry] || item.branch);
const branches = [...new Set(frontendRefs.concat(["backend"]))];
run("git", ["fetch", "--quiet", "origin", ...branches.map(branch => `refs/heads/${branch}:refs/remotes/origin/${branch}`)]);

const results = [];
for (const project of manifest.projects) {
  const certificationRef = certificationRefs[project.industry] || project.branch;
  console.log(`CERTIFY ${project.industry} (${project.industry === "grocery" ? "active shared-backend frontend" : certificationRef})`);
  try {
    if (project.industry === "grocery") {
      const html = fs.readFileSync("demo-static/grocery-new.html", "utf8");
      const core = fs.readFileSync("demo-static/js/grocery-phase1-core.js", "utf8");
      const gateway = fs.readFileSync("demo-static/api/grocery-asset.js", "utf8");
      const phase4 = fs.existsSync("demo-static/js/grocery-phase4-31-40.js") ? fs.readFileSync("demo-static/js/grocery-phase4-31-40.js", "utf8") : "";
      for (const file of [
        "demo-static/grocery-new.html",
        "demo-static/js/grocery-phase1-core.js",
        "demo-static/js/grocery-phase1-terminal-actions.js",
        "demo-static/js/grocery-phase2-11-20.js",
        "demo-static/js/grocery-phase3-21-30.js",
        "demo-static/api/grocery-asset.js"
      ]) assert.ok(fs.existsSync(file), `Active Grocery frontend is missing ${file}`);
      assert.match(html, /grocery-phase1-core\.js/);
      assert.match(core, /axtor-cloud-pos-production\.up\.railway\.app/);
      assert.match(core, /\/api\/v1\/grocery\/context/);
      assert.match(gateway, /X-Axtor-Grocery-Backend["']:\s*["']shared-production["']/);
      assert.match(gateway, /X-Axtor-Legacy-Grocery/);
      assert.doesNotMatch(gateway, /GROCERY_RAILWAY_ORIGIN|axtor-grocery-pos-production\.up\.railway\.app|frontend-grocery|raw\.githubusercontent\.com/);
      if (phase4) {
        assert.match(html, /grocery-phase4-31-40\.js/);
        assert.match(phase4, /Requirements 1–40/);
      }
      assert.equal(project.project, "axtor-grocery");
      assert.equal(project.origin, "https://axtorpos.vercel.app/apps/grocery");
      results.push({ industry: "grocery", branch: "main", certificationRef: "active-main-grocery", staticRelease: "PASS", deployment: "SHARED_BACKEND_GROCERY" });
      console.log("PASS grocery");
      continue;
    }

    const runtimeFile = project.runtime || `${project.industry}-app.js`;
    const dashboard = show(certificationRef, `demo-static/${project.dashboard}`);
    const runtime = show(certificationRef, `demo-static/js/${runtimeFile}`);
    const handoff = show(certificationRef, "demo-static/session-handoff.html");
    const vercel = JSON.parse(show(certificationRef, "demo-static/vercel.json"));
    assert.match(dashboard, new RegExp(runtimeFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${certificationRef} dashboard does not load its vertical runtime`);
    assert.doesNotMatch(dashboard, /industry\.html\?module=/, `${certificationRef} dashboard still routes through a generic industry page`);
    assert.match(runtime, /\/api\/v1\//, `${certificationRef} runtime has no API integration`);
    assert.match(runtime, /industry\/registry|tenant|available only|tenant context/i, `${certificationRef} runtime has no tenant-industry guard`);
    assert.match(handoff, /\/api\/v1\/auth\/exchange/, `${certificationRef} has no handoff exchange`);
    assert.match(handoff, /history\.replaceState/, `${certificationRef} does not remove the one-time code from browser history`);
    assert.doesNotMatch(handoff, /searchParams\.set\(["']token|[?&]token=/, `${certificationRef} transfers a permanent token in a URL`);
    assert.ok(Array.isArray(vercel.rewrites) && vercel.rewrites.some(row => row.source === "/"), `${certificationRef} has no root Vercel route`);
    assert.equal(project.branch, `frontend-${project.industry}`);
    assert.equal(project.project, `axtor-${project.industry}`);
    assert.equal(project.origin, `https://axtorpos.vercel.app/apps/${project.industry}`);
    assert.equal(project.status, "code_complete_not_deployed");
    assert.match(project.sourceAlias, new RegExp(`^https://axtorpos-git-frontend-${project.industry}-axtor1\\.vercel\\.app$`));
    results.push({ industry: project.industry, branch: project.branch, certificationRef, staticRelease: "PASS", deployment: "CODE_COMPLETE_NOT_DEPLOYED" });
    console.log(`PASS ${project.industry}`);
  } catch (error) {
    console.error(`FAIL ${project.industry}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

console.log("CERTIFY backend handoff contract");
const authRoutes = show("backend", "backend/src/routes/auth.routes.ts");
const handoffService = show("backend", "backend/src/services/frontend-handoff.service.ts");
const handoffController = show("backend", "backend/src/controllers/auth-handoff.controller.ts");
assert.match(authRoutes, /post\("\/handoff", requireAuth, frontendHandoff\)/);
assert.match(authRoutes, /post\("\/exchange", exchangeHandoff\)/);
assert.match(handoffService, /HANDOFF_TTL_SECONDS = 120/);
assert.match(handoffService, /randomBytes\(32\)/);
assert.match(handoffService, /tokenHash: hashAuthToken\(code\)/);
assert.match(handoffService, /revokedAt: null/);
assert.match(handoffService, /consumed\.count !== 1/);
assert.match(handoffService, /createAuthToken/);
assert.doesNotMatch(handoffService, /jsonwebtoken|auth\.service|utils\/jwt/);
assert.match(handoffController, /frontendHandoff/);
assert.match(handoffController, /exchangeHandoff/);
console.log("PASS backend handoff contract");

console.log("CERTIFY proposed main SaaS router and delivery layer");
const router = fs.readFileSync("demo-static/js/saas-router.js", "utf8");
const hosts = JSON.parse(fs.readFileSync("demo-static/industry-hosts.json", "utf8"));
const proxy = fs.readFileSync("demo-static/api/industry-asset.js", "utf8");
const groceryProxy = fs.readFileSync("demo-static/api/grocery-asset.js", "utf8");
const mainVercel = JSON.parse(fs.readFileSync("demo-static/vercel.json", "utf8"));
assert.match(router, /same_origin_branch_proxy/);
assert.match(router, /window\.location\.origin/);
assert.match(router, /\/api\/v1\/auth\/handoff/);
assert.match(router, /session-handoff\.html/);
assert.doesNotMatch(router, /searchParams\.set\(["']token/);
assert.match(proxy, /raw\.githubusercontent\.com/);
assert.doesNotMatch(proxy, /frontend-grocery/);
assert.doesNotMatch(proxy, /req\.query\.branch/);
assert.match(groceryProxy, /X-Axtor-Grocery-Backend["']:\s*["']shared-production["']/);
assert.doesNotMatch(groceryProxy, /GROCERY_RAILWAY_ORIGIN|axtor-grocery-pos-production\.up\.railway\.app/);
assert.ok(mainVercel.rewrites.some(row => row.source === "/apps/grocery/:path*"));
assert.ok(mainVercel.rewrites.some(row => row.source === "/apps/:industry/:path*"));
for (const project of manifest.projects) {
  const host = hosts.frontends[project.industry];
  assert.equal(host?.branch, project.branch, `main router branch mismatch for ${project.industry}`);
  assert.equal(host?.dashboard, project.dashboard, `main router dashboard mismatch for ${project.industry}`);
  assert.equal(host?.delivery, "same_origin_branch_proxy", `main router delivery mismatch for ${project.industry}`);
  assert.equal(host?.basePath, `/apps/${project.industry}`, `main router base path mismatch for ${project.industry}`);
  assert.equal(host?.sourceAlias, project.sourceAlias, `main router source alias mismatch for ${project.industry}`);
  if (project.industry !== "grocery") assert.match(proxy, new RegExp(project.branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `proxy branch whitelist missing ${project.branch}`);
}
assert.equal(manifest.projects.length, 13);
assert.deepEqual(manifest.unreleased, []);
console.log("PASS proposed main SaaS router and delivery layer");
console.table(results);
console.log(`PASS: ${results.length} industries certified; 12 existing static frontends preserved, active Grocery uses the approved shared production backend, and secure shared handoff retained`);
