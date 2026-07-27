const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'../demo-static');
const pages=['workshop-dashboard.html','workshop-vehicles.html','workshop-inspections.html','workshop-estimates.html','workshop-jobs.html','workshop-parts.html','workshop-quality.html','workshop-invoices.html','workshop-payments.html','workshop-reminders.html','workshop-delivery.html','workshop-reports.html','workshop-settings.html'];
for(const file of pages){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert.match(html,/workshop-app\.js/);
  assert.match(html,/data-page=/);
  assert.doesNotMatch(html,/industry\.html\?module=/);
}
const app=fs.readFileSync(path.join(root,'js/workshop-app.js'),'utf8');
assert.match(app,/\/api\/v1\/workshop/);
assert.match(app,/\/api\/v1\/industry\/registry/);
assert.match(app,/Idempotency-Key/);
assert.match(app,/Workshop tenants/);
assert.match(app,/\/parts\/reserve/);
assert.match(app,/\/parts\/post/);
assert.match(app,/\/quality-checks/);
assert.match(app,/\/invoices/);
assert.match(app,/\/payments/);
assert.match(app,/\/deliver/);
console.log(`PASS: ${pages.length} purpose-built Workshop pages`);
