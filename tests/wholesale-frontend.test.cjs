const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'../demo-static');
const pages=['wholesale-dashboard.html','wholesale-price-lists.html','wholesale-price-assignments.html','wholesale-unit-conversions.html','wholesale-orders.html','wholesale-allocation.html','wholesale-packing.html','wholesale-routes.html','wholesale-dispatch.html','wholesale-proof-of-delivery.html','wholesale-collections.html','wholesale-credit.html','wholesale-ageing.html','wholesale-reports.html','wholesale-settings.html'];
for(const file of pages){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert.match(html,/wholesale-app\.js/);
  assert.match(html,/data-page=/);
  assert.doesNotMatch(html,/industry\.html\?module=/);
}
const app=fs.readFileSync(path.join(root,'js/wholesale-app.js'),'utf8');
assert.match(app,/\/api\/v1\/wholesale/);
assert.match(app,/\/api\/v1\/industry\/registry/);
assert.match(app,/Idempotency-Key/);
assert.match(app,/Wholesale tenants/);
assert.match(app,/\/orders\/.*\/allocate/);
assert.match(app,/\/packing-lists\/detailed/);
assert.match(app,/\/proof-of-delivery/);
assert.match(app,/\/collections/);
assert.match(app,/\/credit-profiles/);
assert.match(app,/\/receivables\/ageing/);
console.log(`PASS: ${pages.length} purpose-built Wholesale pages`);
