const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'../demo-static');
const pages=['grocery-dashboard.html','grocery-terminal.html','grocery-sales.html','grocery-shifts.html','grocery-customers.html','grocery-products.html','grocery-categories.html','grocery-inventory.html','grocery-batches.html','grocery-expiry.html','grocery-labels.html','grocery-purchases.html','grocery-receiving.html','grocery-suppliers.html','grocery-waste.html','grocery-recalls.html','grocery-promotions.html','grocery-loyalty.html','grocery-expenses.html','grocery-accounts.html','grocery-reports.html','grocery-users.html','grocery-notifications.html','grocery-settings.html'];
for(const file of pages){const html=fs.readFileSync(path.join(root,file),'utf8');assert.match(html,/grocery-app\.js/);assert.match(html,/data-page=/);assert.doesNotMatch(html,/industry\.html\?module=/);}
const app=fs.readFileSync(path.join(root,'js/grocery-app.js'),'utf8');
const readiness=fs.readFileSync(path.join(root,'js/grocery-production-readiness.js'),'utf8');
const operations=fs.readFileSync(path.join(root,'js/grocery-operations-pack.js'),'utf8');
const reporting=fs.readFileSync(path.join(root,'js/grocery-report-sync.js'),'utf8');
assert.match(app,/\/api\/v1\/industry\/registry/);assert.match(app,/inventoryBatchId/);assert.match(readiness,/parseScaleBarcode/);assert.match(readiness,/Thermal 80mm/);assert.match(readiness,/Invoice & Print/);assert.match(operations,/Search saved products/);assert.match(operations,/grocery_purchase_receipt/);assert.match(operations,/grocery_stock_count/);assert.match(operations,/grocery_promotion/);assert.match(operations,/grocery_role_assignment/);assert.match(operations,/\/api\/v1\/products\?active=true/);assert.match(reporting,/reportPath\("daily-sales"/);assert.doesNotMatch(reporting,/JSON\.stringify\(report,\s*null,\s*2\)/);
console.log(`PASS: ${pages.length} Grocery pages with isolated navigation, operational modules, purchase lookup, FEFO, invoice and reports`);
