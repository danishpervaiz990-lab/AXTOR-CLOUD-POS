const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('demo-static/grocery-reports.html','utf8');
const js=fs.readFileSync('demo-static/js/grocery-finance-reports.js','utf8');

for(const id of ['grocery-customer-statement','grocery-supplier-statement','grocery-refund-impact','grocery-finance-summary']){
  assert(js.includes(id),id+' missing');
}
assert(/grocery-finance-reports\.js\?v=20260804-report-stability1/.test(html));
assert(js.includes('/api/v1/reports/'));
assert(js.includes('/api/v1/reports/options'));
assert(js.includes('waitForStableCoreWorkspace'));
assert(js.includes('ensureMounted'));
assert(js.includes('MutationObserver'));
assert(js.includes('scheduleRemount'));
assert(js.includes('current?.report?.value'));
assert(js.includes('Export CSV'));
assert(js.includes('window.print()'));
assert(!/document\.getElementById\("gfReport"\)\.value/.test(js));
assert(!/localStorage/.test(js));
console.log('PASS: Grocery finance reports mount after the core workspace and recover from page re-rendering');
