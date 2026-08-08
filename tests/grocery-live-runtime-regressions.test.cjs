const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.join(__dirname,'../demo-static');
const html=fs.readFileSync(path.join(root,'grocery-new.html'),'utf8');
const core=fs.readFileSync(path.join(root,'js/grocery-phase1-core.js'),'utf8');
const preflight=fs.readFileSync(path.join(root,'js/grocery-runtime-preflight.js'),'utf8');
const printProfile=fs.readFileSync(path.join(root,'js/grocery-phase5-print-profile-v2.js'),'utf8');
const dashboardFix=fs.readFileSync(path.join(root,'js/grocery-dashboard-format-hotfix.js'),'utf8');

assert.match(core,/const get=p=>request\("GET",p\)/,'Grocery core keeps get as a const helper');
assert.match(preflight,/var openCustomerPayment;/);
assert.match(preflight,/var openSupplierPayment;/);
assert.ok(html.indexOf('grocery-runtime-preflight.js')<html.indexOf('grocery-phase2-11-20.js'),'payment hooks must be declared before Requirements 11–20');
assert.doesNotMatch(printProfile,/\bget\s*=\s*async\s+function/,'print profiles must not reassign the const get helper');
assert.match(printProfile,/p50RequestWithProfileBase=request/);
assert.match(printProfile,/request=async function\(method,path,body,extraHeaders\)/);
assert.match(dashboardFix,/No valid prior period/);
assert.doesNotMatch(dashboardFix,/<span class=/,'dashboard comparison helper must return text because metric() escapes subtext');
assert.match(html,/grocery-phase5-print-profile-v2\.js/);
assert.doesNotMatch(html,/grocery-phase5-print-profile\.js\?v=/,'broken print-profile runtime must not be loaded');

console.log('PASS: Grocery live runtime preflight, print-profile and dashboard formatting regressions');
