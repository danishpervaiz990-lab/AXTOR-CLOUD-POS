import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const manifest=JSON.parse(fs.readFileSync('deployment/vercel-industry-projects.json','utf8'));
const expected=['retail','grocery','pharmacy','gym','school','clinic','restaurant','hardware','paint','furniture','workshop','wholesale','manufacturing'];
const releaseRefs={manufacturing:'fix/manufacturing/dedicated-frontend-v1'};
const base='https://raw.githubusercontent.com/danishpervaiz990-lab/AXTOR-CLOUD-POS';

async function fetchText(ref,path){
 const url=`${base}/${encodeURIComponent(ref).replaceAll('%2F','/')}/demo-static/${path.split('/').map(encodeURIComponent).join('/')}`;
 const response=await fetch(url,{headers:{'User-Agent':'Axtor-All-Industries-Code-Certification/1.3'},signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,`${ref}:${path} returned HTTP ${response.status}`);
 return await response.text();
}

function certifyGrocery(project){
 const root='apps/grocery-pos';
 const required=[
  'package.json','vercel.json',
  'app/login/page.tsx','app/dashboard/page.tsx','app/checkout/page.tsx',
  'app/inventory/page.tsx','app/finance/page.tsx','app/cheques/page.tsx',
  'app/api/auth/login/route.ts','app/api/auth/logout/route.ts','app/api/auth/me/route.ts',
  'app/api/shared/[...path]/route.ts','lib/shared-backend.ts','lib/browser-api.ts',
  'app/api/grocery/sales/complete/route.ts','app/api/grocery/reports/payment-reconciliation/route.ts',
  'app/api/grocery/reports/cheques/route.ts','tests/shared-backend.test.ts'
 ];
 for(const file of required)assert.ok(fs.existsSync(`${root}/${file}`),`Grocery replacement is missing ${file}`);
 const pkg=JSON.parse(fs.readFileSync(`${root}/package.json`,'utf8'));
 const vercel=JSON.parse(fs.readFileSync(`${root}/vercel.json`,'utf8'));
 const sharedBackend=fs.readFileSync(`${root}/lib/shared-backend.ts`,'utf8');
 const sharedProxy=fs.readFileSync(`${root}/app/api/shared/[...path]/route.ts`,'utf8');
 const checkout=fs.readFileSync(`${root}/components/checkout-terminal.tsx`,'utf8');
 const gateway=fs.readFileSync('demo-static/api/grocery-asset.js','utf8');
 assert.equal(project.branch,'main');
 assert.equal(project.project,'axtor-grocery-pos');
 assert.equal(project.status,'vercel_shared_backend_prepared');
 assert.equal(project.sourceAlias,'https://axtor-grocery-pos.vercel.app');
 assert.match(pkg.description||'',/existing shared backend/i);
 assert.match(pkg.scripts?.build||'',/next build/);
 assert.equal(pkg.scripts?.['release:railway'],undefined);
 assert.equal(pkg.scripts?.['start:railway'],undefined);
 assert.equal(vercel.framework,'nextjs');
 assert.match(vercel.buildCommand||'',/npm run build/);
 assert.match(sharedBackend,/AXTOR_SHARED_BACKEND_URL/);
 assert.match(sharedBackend,/Authorization/);
 assert.match(sharedBackend,/X-Business-Id/);
 assert.match(sharedBackend,/\/api\/v1\/auth\/login/);
 assert.match(sharedProxy,/allowedRoots/);
 assert.match(sharedProxy,/\/api\/v1\//);
 assert.match(sharedProxy,/MODULE_NOT_ALLOWED/);
 assert.match(checkout,/\/api\/grocery\/sales\/complete/);
 assert.match(checkout,/Idempotency-Key/);
 assert.match(gateway,/axtor-grocery-pos\.vercel\.app/);
 assert.match(gateway,/GROCERY_VERCEL_ORIGIN/);
 assert.match(gateway,/X-Axtor-Legacy-Grocery/);
 assert.doesNotMatch(gateway,/axtor-grocery-pos-production\.up\.railway\.app|GROCERY_RAILWAY_ORIGIN/);
 assert.doesNotMatch(gateway,/frontend-grocery|raw\.githubusercontent\.com/);
 return {industry:'grocery',ref:project.branch,dashboard:'app/dashboard/page.tsx',runtime:'Next.js Vercel application using existing shared backend',status:'PASS'};
}

function runtimeFilesFor(industry){
 return [`${industry}-app.js`];
}

assert.deepEqual(manifest.projects.map(item=>item.industry).sort(),expected.slice().sort());
assert.deepEqual(manifest.unreleased,[]);
const results=[];
for(const project of manifest.projects){
 if(project.industry==='grocery'){
  console.log(`CERTIFY grocery from ${project.branch}`);
  results.push(certifyGrocery(project));
  console.log('PASS grocery');
  continue;
 }
 const ref=releaseRefs[project.industry]||project.branch;
 const runtimeFiles=runtimeFilesFor(project.industry);
 console.log(`CERTIFY ${project.industry} from ${ref}`);
 const [dashboard,vercelText,...runtimes]=await Promise.all([
   fetchText(ref,project.dashboard),
   fetchText(ref,'vercel.json'),
   ...runtimeFiles.map(file=>fetchText(ref,`js/${file}`))
 ]);
 runtimeFiles.forEach((file,index)=>new vm.Script(runtimes[index],{filename:`${ref}/demo-static/js/${file}`}));
 const combinedRuntime=runtimes.join('\n');
 const vercel=JSON.parse(vercelText);
 for(const runtimeFile of runtimeFiles){
   assert.match(dashboard,new RegExp(runtimeFile.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),`${project.industry} dashboard does not load ${runtimeFile}`);
 }
 assert.doesNotMatch(dashboard,/industry\.html\?module=/,`${project.industry} dashboard still uses generic industry routing`);
 assert.match(combinedRuntime,/\/api\/v1\//,`${project.industry} runtime has no backend API integration`);
 assert.match(combinedRuntime,/industry\/registry|verifyTenant|tenant|available only/i,`${project.industry} runtime has no tenant-industry guard`);
 assert.doesNotMatch(combinedRuntime,/industry\.html\?module=/,`${project.industry} runtime links to generic workspace`);
 assert.ok(Array.isArray(vercel.rewrites)&&vercel.rewrites.some(row=>row.source==='/'),`${project.industry} has no branch root route`);
 assert.equal(project.branch,`frontend-${project.industry}`);
 assert.equal(project.dashboard,`${project.industry}-dashboard.html`);
 assert.equal(project.status,'code_complete_not_deployed');
 results.push({industry:project.industry,ref,dashboard:project.dashboard,runtime:runtimeFiles.join(','),status:'PASS'});
 console.log(`PASS ${project.industry}`);
}
assert.equal(results.length,13);
fs.writeFileSync('all-industry-code-certification.json',JSON.stringify({checkedAt:new Date().toISOString(),deploymentAttempted:false,results},null,2));
console.table(results);
console.log('PASS: 12 existing industry frontends remain certified and Grocery is certified as a dedicated Vercel application using the existing shared backend');