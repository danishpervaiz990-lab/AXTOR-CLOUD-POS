import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const manifest = JSON.parse(fs.readFileSync("deployment/vercel-industry-projects.json", "utf8"));

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function show(branch, file) {
  return run("git", ["show", `origin/${branch}:${file}`]);
}

const branches = [...new Set(manifest.projects.map(item => item.branch).concat(["backend"]))];
run("git", ["fetch", "--quiet", "origin", ...branches.map(branch => `refs/heads/${branch}:refs/remotes/origin/${branch}`)]);

const results = [];
for (const project of manifest.projects) {
  console.log(`CERTIFY ${project.industry} (${project.branch})`);
  try {
    const runtimeFile = project.runtime || `${project.industry}-app.js`;
    const dashboard = show(project.branch, `demo-static/${project.dashboard}`);
    const runtime = show(project.branch, `demo-static/js/${runtimeFile}`);
    const handoff = show(project.branch, "demo-static/session-handoff.html");
    const vercel = JSON.parse(show(project.branch, "demo-static/vercel.json"));

    assert.match(dashboard, new RegExp(runtimeFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `${project.branch} dashboard does not load its vertical runtime`);
    assert.doesNotMatch(dashboard, /industry\.html\?module=/, `${project.branch} dashboard still routes through a generic industry page`);
    assert.match(runtime, /\/api\/v1\//, `${project.branch} runtime has no API integration`);
    assert.match(runtime, /industry\/registry|tenant|available only|tenant context/i, `${project.branch} runtime has no tenant-industry guard`);
    assert.match(handoff, /\/api\/v1\/auth\/exchange/, `${project.branch} has no handoff exchange`);
    assert.match(handoff, /history\.replaceState/, `${project.branch} does not remove the one-time code from browser history`);
    assert.doesNotMatch(handoff, /searchParams\.set\(["']token|[?&]token=/, `${project.branch} transfers a permanent token in a URL`);
    assert.ok(Array.isArray(vercel.rewrites) && vercel.rewrites.some(row => row.source === "/"), `${project.branch} has no root Vercel route`);
    assert.equal(project.branch, `frontend-${project.industry}`);
    assert.equal(project.project, `axtor-${project.industry}`);
    assert.equal(project.origin, `https://axtorpos.vercel.app/apps/${project.industry}`);
    assert.equal(project.status, "ready_same_origin_proxy");
    assert.match(project.sourceAlias, new RegExp(`^https://axtorpos-git-frontend-${project.industry}-axtor1\\.vercel\\.app$`));

    results.push({
      industry: project.industry,
      branch: project.branch,
      staticRelease: "PASS",
      deployment: "SAME_ORIGIN_READY"
    });
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
const mainVercel = JSON.parse(fs.readFileSync("demo-static/vercel.json", "utf8"));
assert.match(router, /same_origin_branch_proxy/);
assert.match(router, /window\.location\.origin/);
assert.match(router, /\/api\/v1\/auth\/handoff/);
assert.match(router, /session-handoff\.html/);
assert.doesNotMatch(router, /searchParams\.set\(["']token/);
assert.match(proxy, /raw\.githubusercontent\.com/);
assert.doesNotMatch(proxy, /req\.query\.branch/);
assert.ok(mainVercel.rewrites.some(row => row.source === "/apps/:industry/:path*"));
for (const project of manifest.projects) {
  const host = hosts.frontends[project.industry];
  assert.equal(host?.branch, project.branch, `main router branch mismatch for ${project.industry}`);
  assert.equal(host?.dashboard, project.dashboard, `main router dashboard mismatch for ${project.industry}`);
  assert.equal(host?.delivery, "same_origin_branch_proxy", `main router delivery mismatch for ${project.industry}`);
  assert.equal(host?.basePath, `/apps/${project.industry}`, `main router base path mismatch for ${project.industry}`);
  assert.equal(host?.sourceAlias, project.sourceAlias, `main router source alias mismatch for ${project.industry}`);
  assert.match(proxy, new RegExp(project.branch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `proxy branch whitelist missing ${project.branch}`);
}
console.log("PASS proposed main SaaS router and delivery layer");

console.table(results);
console.log(`PASS: ${results.length} released frontend branches, same-origin delivery, main router, and secure handoff backend contract`);
