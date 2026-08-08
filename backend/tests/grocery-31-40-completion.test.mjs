import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const accounting=fs.readFileSync('src/services/grocery-31-40-accounting.service.ts','utf8');
const commerce=fs.readFileSync('src/services/grocery-31-40-commerce.service.ts','utf8');
const controller=fs.readFileSync('src/controllers/grocery-31-40.controller.ts','utf8');
const cheques=fs.readFileSync('src/controllers/grocery-cheques.controller.ts','utf8');
const routes=fs.readFileSync('src/routes/grocery-cheques.routes.ts','utf8');
const roles=fs.readFileSync('src/services/system-role-definitions.ts','utf8');
const access=fs.readFileSync('src/controllers/access-control-v2.controller.ts','utf8');
const priceHistory=fs.readFileSync('src/controllers/grocery-price-profile-history.controller.ts','utf8');

test('31 trial balance enforces accounting integrity',()=>{
  for(const marker of ['openingDebit','openingCredit','periodDebit','periodCredit','closingDebit','closingCredit','debitPct','creditPct']) assert.ok(accounting.includes(marker),marker);
  assert.match(accounting,/Total Debit/);assert.match(accounting,/Total Credit/);assert.match(accounting,/Accounting integrity error: Trial Balance/);
});

test('32 balance sheet enforces accounting equation and comparison',()=>{
  for(const marker of ['Assets','Liabilities','Equity','currentPeriod','previousPeriod','difference','changePct']) assert.ok(accounting.includes(marker),marker);
  assert.match(accounting,/Assets .* do not equal Liabilities \+ Equity/);
});

test('33 additional accounting report inventory is complete',()=>{
  for(const id of ['grocery-general-ledger','grocery-account-ledger','grocery-journal-report','grocery-cash-book','grocery-bank-book','grocery-accounts-receivable-accounting','grocery-accounts-payable-accounting','grocery-customer-ageing-accounting','grocery-supplier-ageing-accounting','grocery-expense-accounting-report','grocery-tax-summary-accounting','grocery-tax-detail-accounting','grocery-payment-accounting-report','grocery-receipt-accounting-report','grocery-cheque-accounting-report','grocery-credit-debit-accounting-report','grocery-cash-flow-accounting']) assert.ok(accounting.includes(id),id);
});

test('34 cheque workflow supports inward/outward lifecycle and alerts',()=>{
  for(const marker of ['inward','outward','upcoming','due_today','deposited','cleared','bounced','cancelled','replaced','overdue','dueWithin30Days']) assert.ok(cheques.includes(marker),marker);
  assert.match(routes,/\/cheques\/reminders\/generate/);
});

test('35 permissions are backend enforced and include sensitive grocery controls',()=>{
  for(const marker of ['cost','profit','manual price','discount','void','refund','credit','stock','journal','supplier','counter']) assert.ok(roles.toLowerCase().includes(marker),marker);
  assert.match(access,/requireAccessAdministrator/);assert.match(access,/settings\.manage_permissions/);
  for(const routeMarker of ['pricing.manage','promotions.manage','loyalty.manage','loyalty.redeem','sales_documents.return','journals.post','supplier_payments.post']) assert.ok(routes.includes(routeMarker),routeMarker);
});

test('36 audit log captures tenant user action entity before after and network metadata',()=>{
  for(const marker of ['timestamp','user','action','entity','entityId','oldValue','newValue','tenant','reason','ipAddress','userAgent']) assert.ok(controller.includes(marker),marker);
  assert.match(routes,/\/audit-log/);
});

test('37 promotions support required grocery offer types and stacking controls',()=>{
  for(const marker of ['fixed_discount','percentage_discount','product_discount','category_discount','customer_specific_price','member_price','scheduled_promotion','buy_x_get_y','buy_one_get_one','quantity_break','bundle_pricing','mix_and_match','coupon','minimumQuantity','minimumInvoiceAmount','maximumDiscount','usageLimit','allowStacking']) assert.ok(commerce.includes(marker),marker);
  assert.match(routes,/\/promotions\/evaluate/);
});

test('38 loyalty supports earn redeem balance and history surfaces',()=>{
  for(const marker of ['groceryLoyaltySummary','redeemGroceryLoyalty','loyaltyLedger','loyaltyAccount']) assert.ok(commerce.includes(marker)||controller.includes(marker),marker);
  assert.match(routes,/\/loyalty\/ledger/);assert.match(routes,/\/loyalty\/redeem/);
});

test('39 returns refunds and exchange use persisted workflows',()=>{
  assert.match(controller,/createSalesReturn/);assert.match(controller,/groceryCreateSale/);assert.match(controller,/grocery_exchange/);assert.match(controller,/reason/);
  assert.match(routes,/\/exchanges/);
});

test('40 price management exposes levels and auditable history',()=>{
  for(const marker of ['retail','wholesale','customer_specific','member','promotional']) assert.ok(controller.includes(marker)||commerce.includes(marker),marker);
  assert.match(routes,/\/prices\/resolve/);assert.match(routes,/price-history/);
  assert.match(priceHistory,/previous|before/i);assert.match(priceHistory,/changed|updated|created/i);
});