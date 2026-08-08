import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const safe=readFileSync(join(here,'../src/controllers/grocery-accounting-chart-safe.controller.ts'),'utf8');
const barrel=readFileSync(join(here,'../src/controllers/grocery-operations.controller.ts'),'utf8');

test('Grocery Chart of Accounts serializes first-use account bootstrap per tenant',()=>{
  assert.match(safe,/pg_advisory_xact_lock/);
  assert.match(safe,/hashtext/);
  assert.match(safe,/grocery-accounting:\$\{t\.businessId\}/);
  assert.match(safe,/ensureStandardGroceryAccounts\(tx, t\.businessId\)/);
  assert.match(safe,/tx\.account\.findMany/);
  assert.match(safe,/db\.\$transaction/);
});

test('Grocery routes receive the concurrency-safe chart controller export',()=>{
  assert.match(barrel,/groceryChartOfAccountsSafe as groceryChartOfAccounts/);
});
