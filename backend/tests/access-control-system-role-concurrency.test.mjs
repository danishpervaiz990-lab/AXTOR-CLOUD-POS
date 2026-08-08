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
  assert.match(source,/create:\s*\{[\s\S]*?businessId,[\s\S]*?name:\s*definition\.name,[\s\S]*?permissions:\s*\[\.\.\.definition\.permissions\],[\s\S]*?isSystemRole:\s*true/);
  assert.match(source,/update: \{ isSystemRole: true, description: definition\.description \}/);
  assert.doesNotMatch(source,/const created = await tx\.role\.create\(\{\s*data:\s*\{[\s\S]*?businessId,[\s\S]*?name:\s*definition\.name/,'missing system roles must not use race-prone check-then-create');
});

test('Concurrent-safe bootstrap preserves existing customized role-family behavior',()=>{
  assert.match(source,/shouldUpgradeLegacySystemRolePermissions\(current\.name, current\.permissions\)/);
  assert.match(source,/const equivalent = existingRoles\.some/);
  assert.match(source,/if \(equivalent\) continue;/);
  assert.match(source,/update: \{ isSystemRole: true, description: definition\.description \}/);
  assert.doesNotMatch(source,/update: \{[^}]*permissions:/,'upsert update must not overwrite permissions of an already-existing customized canonical role');
});
