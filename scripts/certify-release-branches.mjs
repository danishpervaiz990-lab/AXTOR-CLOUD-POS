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
run("git", ["fetch", "origin", ...branches.map(branch => `refs/heads/${branch}:refs/remotes/origin/${branch}`)]);

const results = [];
for (const project of manifest.projects) {
  const dashboard = show(project.branch, `demo-static/${project.dashboard}`);
  const runtime = show(project.branch, `demo-static/js/${project.industry}-app.js`);
  const handoff = show(project.branch, "demo-static/session-handoff.html");
  const vercel = JSON.parse(show(project.branch, "demo-static/vercel.json"));

  assert.match(dashboard, new RegExp(`${project.industry}-app\\.js`, "i"), `${project.branch} dashboard does not load its vertical runtime`);
  assert.doesNotMatch(dashboard, /industry\.html\?module=/, `${project.branch} dashboard still routes through a generic industry page`);
  assert.match(runtime, /\/api\/v1\//, `${project.branch} runtime has no API integration`);
  assert.match(runtime, /industry\/registry|tenant|available only/i, `${project.branch} runtime has no tenant-industry guard`);
  assert.match(handoff, /\/api\/v1\/auth\/exchange/, `${project.branch} has no handoff exchange`);
  assert.match(handoff, /history\.replaceState/, `${project.branch} does not remove the one-time code from browser history`);
  assert.doesNotMatch(handoff, /searchParams\.set\(["']token|[?&]token=/, `${project.branch} transfers a permanent token in a URL`);
  assert.ok(Array.isArray(vercel.rewrites) && vercel.rewrites.some(row => row.source === "/"), `${project.branch} has no root Vercel route`);
  assert.equal(project.origin, "", `${project.project} origin must remain empty until the real project is provisioned and verified`);
  assert.equal(project.status, "requires_project_creation");

  results.push({ industry: project.industry, branch: project.branch, staticRelease: "PASS", deployment: "BLOCKED_EXTERNAL" });
}

const authRoutes = show("backend", "backend/src/routes/auth.routes.ts");
const handoffService = show("backend", "backend/src/services/frontend-handoff.service.ts");
assert.match(authRoutes, /post\("\/handoff", requireAuth/);
assert.match(authRoutes, /post\("\/exchange", exchangeHandoff/);
assert.match(handoffService, /HANDOFF_TTL_SECONDS = 120/);
assert.match(handoffService, /revokedAt: null/);
assert.match(handoffService, /consumed\.count !== 1/);
assert.match(handoffService, /targetOrigin/);
assert.match(handoffService, /issueAuthToken/);

console.table(results);
console.log(`PASS: ${results.length} released frontend branches and the secure handoff backend contract`);
