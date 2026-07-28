import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const routes = fs.readFileSync('src/routes/manufacturing.routes.ts', 'utf8');
const controller = fs.readFileSync('src/controllers/manufacturing.controller.ts', 'utf8');
const app = fs.readFileSync('src/app.ts', 'utf8');

test('Manufacturing exposes dedicated tenant-scoped workflows and stock posting', () => {
  for (const route of [
    '/dashboard', '/boms', '/work-orders', '/work-orders/:id/material-issues',
    '/work-orders/:id/material-returns', '/work-orders/:id/stages',
    '/work-orders/:id/finished-goods', '/work-orders/:id/scrap',
    '/work-in-progress', '/costs', '/capacity', '/reports', '/settings'
  ]) assert.ok(routes.includes(`"${route}"`), `Missing Manufacturing route ${route}`);

  assert.match(routes, /requireIndustry\("manufacturing", "factory"\)/);
  for (const permission of [
    'industry.manufacturing.bom.manage',
    'industry.manufacturing.work_order.manage',
    'industry.manufacturing.material.manage',
    'industry.manufacturing.quality.manage',
    'industry.manufacturing.capacity.manage',
    'industry.manufacturing.settings.manage'
  ]) assert.ok(routes.includes(permission), `Missing Manufacturing permission ${permission}`);

  for (const recordType of [
    'manufacturing_bom', 'manufacturing_work_order', 'manufacturing_material_issue',
    'manufacturing_material_return', 'manufacturing_wip_event',
    'manufacturing_finished_goods_receipt', 'manufacturing_scrap',
    'manufacturing_capacity_plan'
  ]) assert.ok(controller.includes(recordType), `Missing persisted record type ${recordType}`);

  assert.match(controller, /tx\.product\.update/);
  assert.match(controller, /tx\.stockMovement\.create/);
  assert.match(controller, /Insufficient stock/);
  assert.match(controller, /idempotencyKey/);
  assert.match(controller, /businessId: businessId\(req\)/);
  assert.match(controller, /industryCode: INDUSTRY/);
  assert.match(app, /app\.use\("\/api\/v1\/manufacturing", manufacturingRouter\)/);
  assert.match(app, /manufacturing: "\/api\/v1\/manufacturing"/);
});
