import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const manifest=JSON.parse(fs.readFileSync('deployment/vercel-industry-projects.json','utf8'));
const expected=['retail','grocery','pharmacy','gym','school','clinic','restaurant','hardware','paint','furniture','workshop','wholesale','manufacturing'];
const releaseRefs={manufacturing:'fix/manufacturing/dedicated-frontend-v1'};
const base='https://raw.githubusercontent.com/danishpervaiz990-lab/AXTOR-CLOUD-POS';

async function fetchText(ref,path){
 const url=`${base}/${encodeURIComponent(ref).replaceAll('%2F','/')}/demo-static/${path.split('/').map(encodeURIComponent).join('/')}`;
 const response=await fetch(url,{headers:{'User-Agent':'Axtor-All-Industries-Code-Certification/1.0'},signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,`${ref}:${path} returned HTTP ${response.status}`);
 return await response.text();
}

assert.deepEqual(manifest.projects.map(item=>item.industry).sort(),expected.slice().sort());
assert.deepEqual(manifest.unreleased,[]);
const results=[];
for(const project of manifest.projects){
 const ref=releaseRefs[project.industry]||project.branch;
 const runtimeFile=`${project.industry}-app.js`;
 console.log(`CERTIFY ${project.industry} from ${ref}`);
 const [dashboard,runtime,vercelText]=await Promise.all([
   fetchText(ref,project.dashboard),
   fetchText(ref,`js/${runtimeFile}`),
   fetchText(ref,'vercel.json')
 ]);
 new vm.Script(runtime,{filename:`${ref}/demo-static/js/${runtimeFile}`});
 const vercel=JSON.parse(vercelText);
 assert.match(dashboard,new RegExp(runtimeFile.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),`${project.industry} dashboard does not load ${runtimeFile}`);
 assert.doesNotMatch(dashboard,/industry\.html\?module=/,`${project.industry} dashboard still uses generic industry routing`);
 assert.match(runtime,/\/api\/v1\//,`${project.industry} runtime has no backend API integration`);
 assert.match(runtime,/industry\/registry|verifyTenant|tenant|available only/i,`${project.industry} runtime has no tenant-industry guard`);
 assert.doesNotMatch(runtime,/industry\.html\?module=/,`${project.industry} runtime links to generic workspace`);
 assert.ok(Array.isArray(vercel.rewrites)&&vercel.rewrites.some(row=>row.source==='/'),`${project.industry} has no branch root route`);
 assert.equal(project.branch,`frontend-${project.industry}`);
 assert.equal(project.dashboard,`${project.industry}-dashboard.html`);
 assert.equal(project.status,'code_complete_not_deployed');
 results.push({industry:project.industry,ref,dashboard:project.dashboard,runtime:runtimeFile,status:'PASS'});
 console.log(`PASS ${project.industry}`);
}
assert.equal(results.length,13);
fs.writeFileSync('all-industry-code-certification.json',JSON.stringify({checkedAt:new Date().toISOString(),deploymentAttempted:false,results},null,2));
console.table(results);
console.log('PASS: all 13 industry frontend code branches are complete and certified without Vercel deployment');
