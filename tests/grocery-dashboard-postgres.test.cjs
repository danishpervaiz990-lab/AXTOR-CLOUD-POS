const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'../demo-static');
const html=fs.readFileSync(path.join(root,'grocery-dashboard.html'),'utf8');
const shell=fs.readFileSync(path.join(root,'js/grocery-report-shell.js'),'utf8');
const reportSync=fs.readFileSync(path.join(root,'js/grocery-report-sync.js'),'utf8');
const readiness=fs.readFileSync(path.join(root,'js/grocery-production-readiness.js'),'utf8');

assert.match(html,/grocery-report-shell\.js\?v=20260804-report-shell1/);
assert.match(html,/grocery-report-sync\.js\?v=20260804-report-shell1/);
assert.match(html,/grocery-production-readiness\.js\?v=20260804-report-shell1/);
assert(html.indexOf('grocery-report-shell.js')<html.indexOf('grocery-report-sync.js'),'Shell must load before report renderer');
assert.doesNotMatch(html,/grocery-app\.js/);
assert.doesNotMatch(html,/grocery-dashboard-postgres\.js/);
assert.match(shell,/data-module/);
assert.match(shell,/id=\"app\"/);
assert.match(shell,/groceryReportShell = 'ready'/);
assert.match(shell,/axtor:grocery-report-shell-ready/);
assert.doesNotMatch(shell,/\/api\/v1\/reports\//);
assert.doesNotMatch(shell,/innerHTML.*gTodaySales/);
for(const id of ['daily-sales','sale-products','profit-loss','grocery-expiry-risk','grocery-waste-share','grocery-recall-share']){
  assert.match(reportSync,new RegExp(id));
}
assert.match(reportSync,/\/api\/v1\/reports\//);
assert.match(reportSync,/\/api\/v1\/industry\/batches\?limit=500/);
assert.match(reportSync,/Dashboard and Reports reconciled from the same live PostgreSQL report endpoints/);
assert.match(readiness,/groceryQuickActions/);
assert.match(readiness,/appendChild\(section\)/);
assert.match(readiness,/MutationObserver/);
assert.doesNotMatch(reportSync,/localStorage/);
console.log('PASS: Grocery dashboard has one shell owner and one authoritative PostgreSQL renderer');
