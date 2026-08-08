import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const safe=readFileSync(join(here,'../src/controllers/grocery-accounting-chart-safe.controller.ts'),'utf8');
const barrel=readFileSync(join(here,'../src/controllers/grocery-operations.controller.ts'),'utf8');

test('Grocery Chart of Accounts recovers only from concurrent account uniqueness races',()=>{
  assert.match(safe,/ensureStandardGroceryAccounts\(tx, businessId\)/);
  assert.match(safe,/db\.\$transaction/);
  assert.match(safe,/P2002/);
  assert.match(safe,/isAccountBootstrapUniqueRace/);
  assert.match(safe,/db\.account\.findMany/);
  assert.match(safe,/businessId: t\.businessId/);
  assert.doesNotMatch(safe,/pg_advisory_xact_lock|\$queryRaw|hashtext/,'chart bootstrap must not depend on raw SQL through the proxied transaction client');
});

test('Grocery routes receive the concurrency-safe chart controller export',()=>{
  assert.match(barrel,/groceryChartOfAccountsSafe as groceryChartOfAccounts/);
});
