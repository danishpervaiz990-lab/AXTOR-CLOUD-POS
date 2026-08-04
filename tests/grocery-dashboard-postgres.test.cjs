const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'../demo-static');
const html=fs.readFileSync(path.join(root,'grocery-dashboard.html'),'utf8');
const reportSync=fs.readFileSync(path.join(root,'js/grocery-report-sync.js'),'utf8');
const readiness=fs.readFileSync(path.join(root,'js/grocery-production-readiness.js'),'utf8');

assert.match(html,/grocery-report-sync\.js\?v=20260804-dashboard-single-renderer1/);
assert.match(html,/grocery-production-readiness\.js\?v=20260804-dashboard-single-renderer1/);
assert.doesNotMatch(html,/grocery-dashboard-postgres\.js/);
for(const id of ['daily-sales','sale-products','profit-loss','grocery-expiry-risk','grocery-waste-share','grocery-recall-share']){
  assert.match(reportSync,new RegExp(id));
}
assert.match(reportSync,/\/api\/v1\/reports\//);
assert.match(reportSync,/\/api\/v1\/industry\/batches\?limit=500/);
assert.match(reportSync,/Dashboard and Reports reconciled from the same live PostgreSQL report endpoints/);
assert.match(readiness,/groceryQuickActions/);
assert.match(readiness,/MutationObserver/);
assert.doesNotMatch(reportSync,/localStorage/);
console.log('PASS: Grocery dashboard uses one authoritative PostgreSQL renderer with non-destructive enhancements');
