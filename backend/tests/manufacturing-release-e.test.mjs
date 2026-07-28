import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routes=fs.readFileSync(new URL('../src/routes/manufacturing.routes.ts',import.meta.url),'utf8');
const controller=fs.readFileSync(new URL('../src/controllers/manufacturing-release-e.controller.ts',import.meta.url),'utf8');
const existing=fs.readFileSync(new URL('../src/controllers/manufacturing.controller.ts',import.meta.url),'utf8');

test('Manufacturing operational registry is production-capable',async()=>{
 const module=await import('../dist/industry/manufacturing-release.js');
 const pack=module.MANUFACTURING_PACK;
 assert.equal(pack.code,'manufacturing');
 assert.equal(pack.registrationEnabled,true);
 assert.equal(pack.operationalStatus,'core_ready');
 assert.ok(pack.entities.some(entity=>entity.type==='manufacturing_bom'));
 assert.ok(pack.entities.some(entity=>entity.type==='manufacturing_work_order'));
 assert.ok(pack.entities.some(entity=>entity.type==='manufacturing_quality_check'));
 assert.ok(pack.entities.some(entity=>entity.type==='manufacturing_finished_goods_receipt'));
 assert.ok(pack.defaultRoles['Manufacturing Manager'].includes('industry.manufacturing.*'));
});

test('Manufacturing routes expose the complete Release E workflow',()=>{
 for(const contract of [
  'get("/dashboard"','get("/boms"','post("/boms"','get("/work-orders"','get("/work-orders/:id"','post("/work-orders"','patch("/work-orders/:id"','post("/work-orders/:id/material-issues"','post("/work-orders/:id/material-returns"','post("/work-orders/:id/stages"','post("/work-orders/:id/finished-goods"','post("/work-orders/:id/scrap"','get("/work-in-progress"','get("/quality-checks"','post("/quality-checks"','get("/costs"','get("/capacity"','post("/capacity"','get("/reports"','get("/settings"','put("/settings"'
 ]) assert.ok(routes.includes(contract),`Missing route contract ${contract}`);
 assert.match(routes,/requireIndustry\("manufacturing", "factory"\)/);
 assert.match(routes,/manufacturing-release\.js/);
});

test('Manufacturing writes are tenant scoped and idempotent',()=>{
 assert.match(existing,/businessId: businessId\(req\)/);
 assert.match(existing,/idempotencyKey\(req\)/);
 assert.match(existing,/Insufficient stock/);
 assert.match(existing,/stockMovement\.create/);
 assert.match(existing,/revision: \{ increment: 1 \}/);
 assert.match(controller,/businessId: tenant\(req\)\.businessId/);
 assert.match(controller,/idempotencyKey: oldKey/);
 assert.match(controller,/Accepted and rejected quantities cannot exceed checked quantity/);
 assert.match(controller,/allowedWorkOrderStatuses/);
});

test('Manufacturing cost variance accounts for material returns',()=>{
 assert.match(controller,/materialIssueCost - materialReturnCost/);
 assert.match(controller,/variance: totalActualCost - plannedCost/);
 assert.match(controller,/variancePct/);
});
