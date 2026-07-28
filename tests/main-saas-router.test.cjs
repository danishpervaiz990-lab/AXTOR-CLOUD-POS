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
assert.ok(Object.keys(hosts.frontends).length>=13);
for(const [code,entry] of Object.entries(hosts.frontends)){
  assert.ok(entry.project,`${code} project missing`);
  assert.ok(entry.branch,`${code} branch missing`);
  assert.ok(entry.dashboard,`${code} dashboard missing`);
  if(code!== 'manufacturing'){
    assert.equal(entry.delivery,'same_origin_branch_proxy',`${code} delivery mode mismatch`);
    assert.equal(entry.basePath,`/apps/${code}`,`${code} base path mismatch`);
    assert.match(entry.sourceAlias,/^https:\/\/axtorpos-git-frontend-/);
  }
}
const rewrites=vercel.rewrites.map(row=>`${row.source}->${row.destination}`);
assert.ok(rewrites.includes('/->/saas-index.html'));
assert.ok(rewrites.includes('/industry.html->/router.html'));
assert.ok(rewrites.includes('/dashboard.html->/router.html'));
assert.ok(rewrites.includes('/apps/:industry->/api/industry-asset?industry=:industry'));
assert.ok(rewrites.includes('/apps/:industry/:path*->/api/industry-asset?industry=:industry&path=:path*'));
assert.match(proxy,/frontend-clinic/);
assert.match(proxy,/frontend-pharmacy/);
assert.match(proxy,/raw\.githubusercontent\.com/);
assert.match(proxy,/selected\.includes\("\.\."\)/);
assert.doesNotMatch(proxy,/req\.query\.branch/);

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
console.log('PASS: main SaaS router, isolated industry delivery and secure no-cache login entry are certified');
