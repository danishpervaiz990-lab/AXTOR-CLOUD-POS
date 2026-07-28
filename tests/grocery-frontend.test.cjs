const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'../demo-static');
const pages=['grocery-dashboard.html','grocery-terminal.html','grocery-products.html','grocery-batches.html','grocery-expiry.html','grocery-receiving.html','grocery-waste.html','grocery-recalls.html','grocery-reports.html','grocery-settings.html'];
for(const file of pages){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert.match(html,/grocery-app\.js/);
  assert.match(html,/data-page=/);
  assert.doesNotMatch(html,/industry\.html\?module=/);
}
const app=fs.readFileSync(path.join(root,'js/grocery-app.js'),'utf8');
assert.match(app,/\/api\/v1\/industry\/registry/);
assert.match(app,/\/api\/v1\/industry\/batches/);
assert.match(app,/\/api\/v1\/industry\/records/);
assert.match(app,/\/api\/v1\/sales-documents/);
assert.match(app,/Idempotency-Key/);
assert.match(app,/Grocery tenants/);
assert.match(app,/grocery_fefo_terminal/);
assert.match(app,/inventoryBatchId/);
assert.match(app,/grocery_waste/);
assert.match(app,/grocery_recall/);
console.log(`PASS: ${pages.length} purpose-built Grocery pages`);
