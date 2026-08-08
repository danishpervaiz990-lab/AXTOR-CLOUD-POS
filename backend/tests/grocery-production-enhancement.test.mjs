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
const salesAdmin=readFileSync(join(here,'../src/controllers/grocery-sales-admin.controller.ts'),'utf8');
const heldSales=readFileSync(join(here,'../src/controllers/grocery-held-sales.controller.ts'),'utf8');
const financeOps=readFileSync(join(here,'../src/controllers/grocery-finance-ops.controller.ts'),'utf8');
const access=readFileSync(join(here,'../src/services/access.service.ts'),'utf8');

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

test('held sales, journals and expense vouchers use transactional tenant sequences',()=>{
  assert.match(heldSales,/nextEntityNumber/);
  assert.match(heldSales,/sequenceKey:\s*"grocery\.held_sale"/);
  assert.doesNotMatch(heldSales,/HOLD-\$\{Date\.now\(\)\}/,'held sales must not use timestamp numbering');
  assert.match(financeOps,/sequenceKey:"grocery\.journal"/);
  assert.match(financeOps,/sequenceKey:"grocery\.expense"/);
  assert.doesNotMatch(financeOps,/JRN-\$\{Date\.now\(\)\}/,'journals must not use timestamp numbering');
  assert.doesNotMatch(financeOps,/EXP-\$\{Date\.now\(\)\}/,'expense vouchers must not use timestamp numbering');
  assert.match(financeOps,/Journal number already exists/);
  assert.match(financeOps,/Expense voucher number already exists/);
  assert.match(financeOps,/grocery\.journal\.create/,'journal creation must emit audit evidence');
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

test('canonical Sales Managers may exercise the existing audited credit override permission only',()=>{
  assert.match(access,/canonicalSalesApprovalRoles/);
  assert.match(access,/permission === "sales_documents\.override_credit_limit"/);
  assert.match(access,/purchase\/warehouse manager/i,'the code must document that unrelated manager families remain excluded');
});

test('Sales Administration uses real server records, pagination, and safe draft conversions',()=>{
  assert.match(routes,/sales-admin\/documents/);
  assert.match(salesAdmin,/salesDocument\.findMany/);
  assert.match(salesAdmin,/salesDocument\.count/);
  assert.match(salesAdmin,/pageSize/);
  assert.match(salesAdmin,/createSalesDocument/,'conversion must reuse the existing sales document creation controller');
  assert.match(salesAdmin,/postingMode:"draft"/,'converted documents must begin as drafts to prevent duplicate financial or stock posting');
  assert.match(salesAdmin,/grocery-convert:/,'conversion must be idempotent per source and target type');
  assert.match(salesAdmin,/conversions/,'source/target conversion history must be persisted');
});

test('numbering settings cover core Grocery master and transaction codes',()=>{
  for(const key of ['customer','supplier','product','employee','invoice','quotation','delivery_note','purchase_order','grn','payment','supplier_payment','return','refund','transfer','approval','held_sale']) {
    assert.match(enhancement,new RegExp(`key:\\"${key}\\"`),`missing sequence ${key}`);
  }
  assert.match(enhancement,/grocery_supplier_code/,'supplier codes must be persisted, not browser-only');
  assert.match(enhancement,/grocery_user_code/,'employee\/user codes must be persisted, not browser-only');
});
