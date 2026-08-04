const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('demo-static/grocery-reports.html','utf8');
const shell=fs.readFileSync('demo-static/js/grocery-report-shell.js','utf8');
const core=fs.readFileSync('demo-static/js/grocery-report-sync.js','utf8');
const js=fs.readFileSync('demo-static/js/grocery-finance-reports.js','utf8');

for(const id of ['grocery-customer-statement','grocery-supplier-statement','grocery-refund-impact','grocery-finance-summary']){
  assert(js.includes(id),id+' missing');
}
assert(/grocery-report-shell\.js\?v=20260804-report-shell1/.test(html));
assert(/grocery-report-sync\.js\?v=20260804-report-shell1/.test(html));
assert(/grocery-finance-reports\.js\?v=20260804-report-shell1/.test(html));
assert(html.indexOf('grocery-report-shell.js')<html.indexOf('grocery-report-sync.js'));
assert(html.indexOf('grocery-report-sync.js')<html.indexOf('grocery-finance-reports.js'));
assert(!/grocery-app\.js/.test(html));
assert(shell.includes('id="app"'));
assert(core.includes('async function reports()'));
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
console.log('PASS: Grocery reports have one shell owner, one core renderer and stable finance extensions');
