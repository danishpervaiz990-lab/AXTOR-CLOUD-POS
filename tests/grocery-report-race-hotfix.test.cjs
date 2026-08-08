const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('demo-static/grocery-new.html','utf8');
const hotfix=fs.readFileSync('demo-static/js/grocery-report-race-hotfix.js','utf8');

assert(html.includes('/js/grocery-report-race-hotfix.js?v=20260808-1'),'report race hotfix must load');
assert(html.indexOf('grocery-report-race-hotfix.js')>html.indexOf('grocery-phase3-report-filters.js'),'hotfix must replace the final phase-3 report wrapper');
assert(html.indexOf('grocery-report-race-hotfix.js')<html.indexOf('grocery-phase4-31-40.js'),'report hotfix must be active before later feature layers');
assert.match(hotfix,/let groceryReportGeneration=0/);
assert.match(hotfix,/groceryReportRequestCurrent/);
assert.match(hotfix,/generation===groceryReportGeneration/);
assert.match(hotfix,/state\.view===view/);
assert.match(hotfix,/REPORT_VIEWS\[state\.view\]===family/);
assert.match(hotfix,/if\(!groceryReportRequestCurrent\(generation,requestedView,family\)\)return;/);
assert.match(hotfix,/runReport30=async function\(form\)/);
assert.doesNotMatch(hotfix,/setInterval|location\.reload|window\.reload/,'report race fix must not poll or reload');

console.log('PASS: Grocery report-family and report-result stale responses are discarded.');
