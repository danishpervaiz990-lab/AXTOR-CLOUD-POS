import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(join(here,'../src/services/system-roles.service.ts'),'utf8');
const schema=readFileSync(join(here,'../prisma/schema.prisma'),'utf8');

test('Role model keeps tenant/name uniqueness used by concurrent bootstrap',()=>{
  assert.match(schema,/model Role \{[\s\S]*@@unique\(\[businessId, name\]\)/);
});

test('System role bootstrap atomically upserts missing canonical roles',()=>{
  assert.match(source,/tx\.role\.upsert/);
  assert.match(source,/businessId_name: \{ businessId, name: definition\.name \}/);
  assert.match(source,/create: \{ businessId, name: definition\.name/);
  assert.match(source,/update: \{ isSystemRole: true, description: definition\.description \}/);
  assert.doesNotMatch(source,/const created = await tx\.role\.create\(\{ data: \{ businessId, name: definition\.name/,'missing system roles must not use race-prone check-then-create');
});
