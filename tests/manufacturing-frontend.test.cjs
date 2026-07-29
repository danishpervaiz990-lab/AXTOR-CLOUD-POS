const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'../demo-static');
const pages={
 dashboard:'manufacturing-dashboard.html',materials:'manufacturing-materials.html',boms:'manufacturing-boms.html','work-orders':'manufacturing-work-orders.html','work-order-view':'manufacturing-work-order-view.html','material-issues':'manufacturing-material-issues.html','material-returns':'manufacturing-material-returns.html',wip:'manufacturing-wip.html',stages:'manufacturing-stages.html',quality:'manufacturing-quality.html','finished-goods':'manufacturing-finished-goods.html',scrap:'manufacturing-scrap.html',costing:'manufacturing-costing.html',capacity:'manufacturing-capacity.html',reports:'manufacturing-reports.html',settings:'manufacturing-settings.html'
};
assert.ok(fs.existsSync(path.join(root,'js/manufacturing-app.js')),'Manufacturing runtime missing');
assert.ok(fs.existsSync(path.join(root,'css/manufacturing-app.css')),'Manufacturing stylesheet missing');
const runtime=fs.readFileSync(path.join(root,'js/manufacturing-app.js'),'utf8');
assert.match(runtime,/const ROOT="\/api\/v1\/manufacturing"/);
assert.match(runtime,/industry\/registry/);
assert.match(runtime,/available only to Manufacturing tenants/);
assert.match(runtime,/Idempotency-Key/);
assert.match(runtime,/\/quality-checks/);
assert.match(runtime,/\/work-orders\/"\+encodeURIComponent\(id\)/);
assert.match(runtime,/\/material-issues/);
assert.match(runtime,/\/material-returns/);
assert.match(runtime,/\/finished-goods/);
assert.match(runtime,/\/scrap/);
assert.match(runtime,/\/capacity/);
assert.match(runtime,/\/costs/);
assert.doesNotMatch(runtime,/industry\.html\?module=/);
assert.doesNotMatch(runtime,/localStorage\.setItem\([^,]+records/i);
for(const [page,file] of Object.entries(pages)){
 const full=path.join(root,file);
 assert.ok(fs.existsSync(full),`${file} missing`);
 const html=fs.readFileSync(full,'utf8');
 assert.match(html,new RegExp(`data-page=["']${page.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["']`),`${file} page key mismatch`);
 assert.match(html,/manufacturing-app\.css/);
 assert.match(html,/manufacturing-app\.js/);
 assert.doesNotMatch(html,/industry\.html\?module=/);
}
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
assert.equal(vercel.rewrites[0].destination,'/manufacturing-dashboard.html');
assert.equal(vercel.git.deploymentEnabled['fix/*'],false);
assert.equal(vercel.git.deploymentEnabled['frontend-*'],false);
console.log(`PASS: ${Object.keys(pages).length} dedicated Manufacturing pages and non-deploying release configuration`);
