const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'../demo-static');
const landing=fs.readFileSync(path.join(root,'saas-index.html'),'utf8');
const login=fs.readFileSync(path.join(root,'login.html'),'utf8');
const router=fs.readFileSync(path.join(root,'js/saas-router.js'),'utf8');
const handoff=fs.readFileSync(path.join(root,'js/session-handoff.js'),'utf8');
const onboarding=fs.readFileSync(path.join(root,'tenant-onboarding.html'),'utf8');
const proxy=fs.readFileSync(path.join(root,'api/industry-asset.js'),'utf8');
const hosts=JSON.parse(fs.readFileSync(path.join(root,'industry-hosts.json'),'utf8'));
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../deployment/vercel-industry-projects.json'),'utf8'));
const expected=['retail','grocery','pharmacy','gym','school','clinic','restaurant','hardware','paint','furniture','workshop','wholesale','manufacturing'];

assert.match(landing,/SaaS entry/);
assert.doesNotMatch(landing,/href="terminal\.html"/);
assert.doesNotMatch(landing,/industry\.html\?module=/);
assert.match(router,/\/api\/v1\/auth\/handoff/);
assert.match(router,/\/api\/v1\/industry\/registry/);
assert.match(router,/session-handoff\.html/);
assert.match(router,/tenant-onboarding\.html/);
assert.match(router,/same_origin_branch_proxy/);
assert.match(router,/window\.location\.origin/);
assert.doesNotMatch(router,/searchParams\.set\(["']token/);
assert.doesNotMatch(router,/axtorAuthToken.*searchParams/);
assert.match(handoff,/\/api\/v1\/auth\/exchange/);
assert.match(handoff,/history\.replaceState/);
assert.match(handoff,/targetOrigin: window\.location\.origin/);
assert.match(onboarding,/window\.location\.replace\(target\)/);
assert.match(onboarding,/setup\.html/);
assert.ok(fs.existsSync(path.join(root,'setup.html')),'setup.html onboarding implementation is missing');

assert.deepEqual(Object.keys(hosts.frontends).sort(),expected.slice().sort(),'Router must contain exactly the 13 supported industry frontends');
for(const code of expected){
  const entry=hosts.frontends[code];
  assert.ok(entry,`${code} router entry missing`);
  assert.equal(entry.project,`axtor-${code}`,`${code} project mismatch`);
  assert.equal(entry.branch,`frontend-${code}`,`${code} branch mismatch`);
  assert.equal(entry.dashboard,`${code}-dashboard.html`,`${code} dashboard mismatch`);
  assert.equal(entry.delivery,'same_origin_branch_proxy',`${code} delivery mode mismatch`);
  assert.equal(entry.basePath,`/apps/${code}`,`${code} base path mismatch`);
  assert.match(entry.sourceAlias,new RegExp(`^https://axtorpos-git-frontend-${code}-`),`${code} source alias mismatch`);
}

assert.equal(manifest.projects.length,13,'Deployment manifest must include all 13 industries');
assert.deepEqual(manifest.projects.map(item=>item.industry).sort(),expected.slice().sort());
assert.deepEqual(manifest.unreleased,[],'No industry should remain marked unreleased after Release E');
for(const item of manifest.projects){
  assert.equal(item.branch,`frontend-${item.industry}`);
  assert.equal(item.dashboard,`${item.industry}-dashboard.html`);
  assert.equal(item.status,'code_complete_not_deployed');
}

const rewrites=vercel.rewrites.map(row=>`${row.source}->${row.destination}`);
assert.ok(rewrites.includes('/->/saas-index.html'));
assert.ok(rewrites.includes('/industry.html->/router.html'));
assert.ok(rewrites.includes('/dashboard.html->/router.html'));
assert.ok(rewrites.includes('/apps/:industry->/api/industry-asset?industry=:industry'));
assert.ok(rewrites.includes('/apps/:industry/:path*->/api/industry-asset?industry=:industry&path=:path*'));
for(const code of expected){
  assert.match(proxy,new RegExp(`\\b${code}: \\{ branch: "frontend-${code}", dashboard: "${code}-dashboard\\.html" \\}`),`${code} gateway entry missing`);
}
assert.match(proxy,/raw\.githubusercontent\.com/);
assert.match(proxy,/selected\.includes\("\.\."\)/);
assert.match(proxy,/MAX_ASSET_BYTES/);
assert.match(proxy,/AbortSignal\.timeout/);
assert.match(proxy,/runtime:\s*["']edge["']/);
assert.match(proxy,/new URL\(request\.url\)/);
assert.match(proxy,/searchParams\.get\(["']industry["']\)/);
assert.match(proxy,/searchParams\.get\(["']path["']\)/);
assert.match(proxy,/export default async function industryAsset/);
assert.doesNotMatch(proxy,/req\.query/);
assert.doesNotMatch(proxy,/module\.exports/);
assert.doesNotMatch(proxy,/Buffer\.from/);
assert.doesNotMatch(proxy,/url\.parse\s*\(/);

// Authentication entry must never publish a working account or temporary password.
assert.doesNotMatch(login,/owner@axtorpos\.local/i);
assert.doesNotMatch(login,/AxtorTemp12345/i);
assert.match(login,/placeholder="name@company\.com"/);
assert.match(login,/placeholder="Enter your password"/);
assert.match(login,/cache:'no-store'/);
assert.match(login,/getRegistrations\(\)/);
assert.match(login,/caches\.keys\(\)/);
assert.match(login,/\/api\/v1\/auth\/me/);
assert.match(login,/\|\| 'router\.html'/);
assert.doesNotMatch(login,/const dedicatedHome/);
const loginHeaderRules=vercel.headers.filter(row=>row.source==='/login.html'||row.source==='/login');
assert.equal(loginHeaderRules.length,2,'Both /login and /login.html require explicit no-cache rules');
for(const rule of loginHeaderRules){
  const values=Object.fromEntries(rule.headers.map(item=>[item.key.toLowerCase(),item.value]));
  assert.match(values['cache-control']||'',/no-store/);
  assert.equal(values.pragma,'no-cache');
}
console.log('PASS: main SaaS router, 13 isolated industry branches, Edge URL gateway and no-cache login entry are code-certified without deployment');
