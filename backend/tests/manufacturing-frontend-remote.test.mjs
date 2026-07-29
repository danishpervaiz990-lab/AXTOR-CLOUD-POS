import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const ref='fix/manufacturing/dedicated-frontend-v1';
const rawBase=`https://raw.githubusercontent.com/danishpervaiz990-lab/AXTOR-CLOUD-POS/${ref}/demo-static`;
async function text(path){
 const response=await fetch(`${rawBase}/${path}`,{headers:{'User-Agent':'Axtor-Release-E-Certification/1.0'}});
 assert.equal(response.status,200,`${path} returned ${response.status}`);
 return await response.text();
}
const pages={dashboard:'manufacturing-dashboard.html',materials:'manufacturing-materials.html',boms:'manufacturing-boms.html','work-orders':'manufacturing-work-orders.html','work-order-view':'manufacturing-work-order-view.html','material-issues':'manufacturing-material-issues.html','material-returns':'manufacturing-material-returns.html',wip:'manufacturing-wip.html',stages:'manufacturing-stages.html',quality:'manufacturing-quality.html','finished-goods':'manufacturing-finished-goods.html',scrap:'manufacturing-scrap.html',costing:'manufacturing-costing.html',capacity:'manufacturing-capacity.html',reports:'manufacturing-reports.html',settings:'manufacturing-settings.html'};

test('Manufacturing frontend branch is complete and syntactically valid',async()=>{
 const [runtime,css,vercelText]=await Promise.all([text('js/manufacturing-app.js'),text('css/manufacturing-app.css'),text('vercel.json')]);
 new vm.Script(runtime,{filename:'manufacturing-app.js'});
 assert.match(runtime,/\/api\/v1\/manufacturing/);
 assert.match(runtime,/industry\/registry/);
 assert.match(runtime,/available only to Manufacturing tenants/);
 assert.match(runtime,/Idempotency-Key/);
 assert.match(runtime,/\/quality-checks/);
 assert.match(runtime,/\/material-issues/);
 assert.match(runtime,/\/finished-goods/);
 assert.doesNotMatch(runtime,/industry\.html\?module=/);
 assert.ok(css.length>5000,'Manufacturing stylesheet is unexpectedly small');
 const vercel=JSON.parse(vercelText);
 assert.equal(vercel.git.deploymentEnabled['fix/*'],false);
 assert.equal(vercel.git.deploymentEnabled['frontend-*'],false);
 assert.equal(vercel.rewrites[0].destination,'/manufacturing-dashboard.html');
 for(const [page,file] of Object.entries(pages)){
  const html=await text(file);
  assert.match(html,new RegExp(`data-page=["']${page.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["']`),`${file} has the wrong page key`);
  assert.match(html,/manufacturing-app\.css/);
  assert.match(html,/manufacturing-app\.js/);
  assert.doesNotMatch(html,/industry\.html\?module=/);
 }
});
