import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const numbering=readFileSync(join(here,'../src/services/numbering.service.ts'),'utf8');
const enhancement=readFileSync(join(here,'../src/services/grocery-enhancement.service.ts'),'utf8');
const documentNumber=readFileSync(join(here,'../src/utils/document-number.ts'),'utf8');
const routes=readFileSync(join(here,'../src/routes/grocery-41-50.routes.ts'),'utf8');

test('generic numbering is tenant serialized and durably stored',()=>{
  assert.match(numbering,/tx\.business\.update/,'allocator must take the tenant row lock inside the transaction');
  assert.match(numbering,/numbering\.sequence\./);
  assert.match(numbering,/tx\.appSetting\.upsert/);
  assert.doesNotMatch(numbering,/take:\s*100/,'allocator must not infer the next number from only the latest 100 rows');
  assert.doesNotMatch(numbering,/Date\.now\(\).*padding/,'allocator must not fall back to timestamp suffixes');
});

test('sales documents use the same safe sequence allocator',()=>{
  assert.match(documentNumber,/nextEntityNumber/);
  assert.match(documentNumber,/sequenceKey:\s*`sales\.\$\{documentType\}`/);
  assert.doesNotMatch(documentNumber,/pg_advisory_xact_lock/,'document numbering must not rely on the production-incompatible advisory lock');
});

test('enhancement exposes a global currency and 15-language framework',async()=>{
  const service=await import('../dist/services/grocery-enhancement.service.js');
  const currencies=service.groceryCurrencyCatalog();
  assert.ok(currencies.length>=100,`expected at least 100 currencies, got ${currencies.length}`);
  for(const code of ['QAR','KWD','RUB','USD','EUR','GBP','AED','SAR','BHD','OMR','PKR','INR','CNY','JPY','CAD','AUD','NZD','CHF','SGD','HKD']) assert.ok(currencies.some(x=>x.code===code),`missing ${code}`);
  assert.equal(service.GROCERY_LANGUAGES.length,15);
  assert.equal(service.GROCERY_LANGUAGES.find(x=>x.code==='ar')?.dir,'rtl');
  assert.equal(service.GROCERY_LANGUAGES.find(x=>x.code==='ur')?.dir,'rtl');
});

test('privileged Grocery sales actions stay server routed and audited',()=>{
  assert.match(routes,/sales-admin\/credit-overrides/);
  assert.match(routes,/sales-admin\/held\/.*approve/);
  assert.match(enhancement,/canApproveSales/);
  assert.match(enhancement,/writeAudit/);
  assert.match(enhancement,/creditApprovalStatus/);
  assert.match(enhancement,/heldDecisionByUserId/);
  assert.match(enhancement,/businessId/,'approval queries must retain tenant ownership');
});

test('numbering settings cover core Grocery master and transaction codes',()=>{
  for(const key of ['customer','supplier','product','employee','invoice','quotation','delivery_note','purchase_order','grn','payment','supplier_payment','return','transfer','approval','held_sale']) {
    assert.match(enhancement,new RegExp(`key:\\"${key}\\"`),`missing sequence ${key}`);
  }
  assert.match(enhancement,/grocery_supplier_code/,'supplier codes must be persisted, not browser-only');
  assert.match(enhancement,/grocery_user_code/,'employee\/user codes must be persisted, not browser-only');
});
