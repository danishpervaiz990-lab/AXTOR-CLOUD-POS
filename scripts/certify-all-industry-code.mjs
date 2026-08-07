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
 const root='demo-static';
 const runtimeFiles=[
  'js/grocery-phase1-core.js',
  'js/grocery-phase1-customer.js',
  'js/grocery-phase1-supplier.js',
  'js/grocery-phase1-ageing.js',
  'js/grocery-phase1-purchase.js',
  'js/grocery-phase1-terminal-context.js',
  'js/grocery-phase1-terminal-components.js',
  'js/grocery-phase1-terminal-layout.js',
  'js/grocery-phase1-terminal-bind.js',
  'js/grocery-phase1-terminal-actions.js',
  'js/grocery-phase1-finance.js',
  'js/grocery-phase1-export-init.js'
 ];
 const required=['grocery-new.html','css/grocery-new.css','css/grocery-phase1.css','api/grocery-asset.js',...runtimeFiles];
 for(const file of required)assert.ok(fs.existsSync(`${root}/${file}`),`Active Grocery frontend is missing ${file}`);
 const html=fs.readFileSync(`${root}/grocery-new.html`,'utf8');
 const core=fs.readFileSync(`${root}/js/grocery-phase1-core.js`,'utf8');
 const gateway=fs.readFileSync(`${root}/api/grocery-asset.js`,'utf8');
 const combined=runtimeFiles.map(file=>fs.readFileSync(`${root}/${file}`,'utf8')).join('\n');
 runtimeFiles.forEach(file=>new vm.Script(fs.readFileSync(`${root}/${file}`,'utf8'),{filename:`${root}/${file}`}));
 assert.equal(project.project,'axtor-grocery');
 assert.equal(project.origin,'https://axtorpos.vercel.app/apps/grocery');
 assert.match(html,/grocery-phase1-core\.js/);
 assert.match(html,/grocery-phase1-terminal-actions\.js/);
 assert.match(core,/axtor-cloud-pos-production\.up\.railway\.app/);
 assert.match(core,/\/api\/v1\/grocery\/context/);
 assert.match(combined,/\/api\/v1\/grocery\/sales/);
 assert.match(combined,/\/api\/v1\/grocery\/purchase-orders/);
 assert.match(combined,/\/api\/v1\/grocery\/expiry/);
 assert.match(combined,/\/api\/v1\/grocery\/ageing/);
 assert.match(gateway,/X-Axtor-Grocery-Backend["']:\s*["']shared-production["']/);
 assert.match(gateway,/X-Axtor-Legacy-Grocery/);
 assert.doesNotMatch(gateway,/GROCERY_RAILWAY_ORIGIN|frontend-grocery|raw\.githubusercontent\.com/);
 return {industry:'grocery',ref:'active-main-grocery',dashboard:'grocery-new.html',runtime:'isolated Grocery frontend + approved shared backend APIs',status:'PASS'};
}

function runtimeFilesFor(industry){
 return [`${industry}-app.js`];
}

assert.deepEqual(manifest.projects.map(item=>item.industry).sort(),expected.slice().sort());
assert.deepEqual(manifest.unreleased,[]);
const results=[];
for(const project of manifest.projects){
 if(project.industry==='grocery'){
  console.log('CERTIFY grocery from active isolated frontend');
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
console.log('PASS: 12 existing industry frontends remain certified and Grocery is certified as the isolated frontend using approved shared backend APIs');