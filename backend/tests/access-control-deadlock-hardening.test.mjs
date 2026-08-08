import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const service=readFileSync(join(here,'../src/services/system-roles.service.ts'),'utf8');
const controller=readFileSync(join(here,'../src/controllers/access-control-v2.controller.ts'),'utf8');
const routes=readFileSync(join(here,'../src/routes/access-control.routes.ts'),'utf8');

test('access-control GET prepares roles once in middleware, not again in controller',()=>{
  assert.match(routes,/router\.use\(ensureTenantSystemRoles\)/);
  assert.doesNotMatch(controller,/ensureSystemRoles/,'GET controller must not repeat mutable system-role bootstrap');
  assert.match(controller,/const \[roles, users\] = await Promise\.all/);
});

test('system-role preparation uses stable ordering and skips unchanged role updates',()=>{
  assert.match(service,/orderBy: \{ name: "asc" \}/);
  assert.match(service,/const needsUpdate =/);
  assert.match(service,/if \(!needsUpdate\) continue;/);
  assert.match(service,/permissionsEqual\(current\.permissions, definition\.permissions\)/);
  assert.match(service,/tx\.role\.upsert/);
});

test('tenant role middleware retries only PostgreSQL deadlocks with a bounded limit',()=>{
  assert.match(service,/const DEADLOCK_RETRIES = 2/);
  assert.match(service,/40P01\|deadlock detected/i);
  assert.match(service,/if \(!isDeadlockError\(error\) \|\| attempt >= DEADLOCK_RETRIES\) throw error/);
  assert.match(service,/await sleep\(20 \* attempt\)/);
});

test('access-control read errors distinguish permission denials from server failures',()=>{
  assert.match(controller,/const status = isPermissionDenied\(error\) \? 403 : 500/);
  assert.match(controller,/Unable to load access control/);
});
