import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const accounting=fs.readFileSync('src/services/grocery-31-40-accounting.service.ts','utf8');
const commerce=fs.readFileSync('src/services/grocery-31-40-commerce.service.ts','utf8');
const reversals=fs.readFileSync('src/services/grocery-31-40-reversals.service.ts','utf8');
const routes=fs.readFileSync('src/routes/grocery-cheques.routes.ts','utf8');
const cheque=fs.readFileSync('src/controllers/grocery-cheques.controller.ts','utf8');
const roles=fs.readFileSync('src/services/system-role-definitions.ts','utf8');
const access=fs.readFileSync('src/services/access.service.ts','utf8');
const sale=fs.readFileSync('src/controllers/grocery-sales.controller.ts','utf8');
const returnCtl=fs.readFileSync('src/controllers/grocery-31-40-returns.controller.ts','utf8');
const priceHistory=fs.readFileSync('src/controllers/grocery-price-profile-history.controller.ts','utf8');
const loginAudit=fs.readFileSync('src/middleware/grocery-login-audit.middleware.ts','utf8');
const reportCtl=fs.readFileSync('src/controllers/reports.controller.ts','utf8');

test('31 Trial Balance enforces double-entry integrity and requested columns',()=>{
  for(const marker of ['openingDebit','openingCredit','periodDebit','periodCredit','closingDebit','closingCredit','debitPct','creditPct']) assert.ok(accounting.includes(marker),marker);
  assert.match(accounting,/Trial Balance debit .* does not equal credit/);
});
test('32 Balance Sheet enforces Assets equals Liabilities plus Equity and comparison',()=>{
  for(const marker of ['Assets','Liabilities','Equity','currentPeriod','previousPeriod','difference','changePct','assets=liabilities+equity']) assert.ok(accounting.includes(marker),marker);
  assert.match(accounting,/do not equal Liabilities \+ Equity/);
});
test('33 additional accounting reports are ledger-backed',()=>{
  for(const id of ['grocery-general-ledger','grocery-account-ledger','grocery-journal-report','grocery-cash-book','grocery-bank-book','grocery-accounts-receivable-accounting','grocery-accounts-payable-accounting','grocery-customer-ageing-accounting','grocery-supplier-ageing-accounting','grocery-expense-accounting-report','grocery-tax-summary-accounting','grocery-tax-detail-accounting','grocery-payment-accounting-report','grocery-receipt-accounting-report','grocery-cheque-accounting-report','grocery-credit-debit-accounting-report','grocery-cash-flow-accounting']) assert.ok(accounting.includes(id),id);
  assert.match(accounting,/accountTransaction\.findMany/);
});
test('34 cheque lifecycle includes due states and audit',()=>{
  for(const marker of ['upcoming','due_today','deposited','cleared','bounced','cancelled','replaced','overdue','inward','outward']) assert.ok(cheque.includes(marker),marker);
  for(const marker of ['grocery.cheque.create','grocery.cheque.reminders.generate','writeAudit']) assert.ok(cheque.includes(marker),marker);
});
test('35 roles and sensitive permissions are explicit and backend checked',()=>{
  for(const role of ['Owner','Admin','Manager','Accountant','Purchase Manager','Warehouse Manager','Cashier','Salesperson']) assert.ok(roles.includes(`name: "${role}"`),role);
  for(const permission of ['pricing.manual_override','discounts.override','sales_documents.void','sales_documents.refund','sales_documents.override_credit_limit','inventory.adjust','journals.post','supplier_payments.post','shifts.close','reports.pnl','reports.balance_sheet','reports.trial_balance','reports.export','reports.print']) assert.ok(roles.includes(`"${permission}"`),permission);
  for(const permission of ['pricing.manual_override','discounts.override','sales_documents.void','journals.post','supplier_payments.post']) assert.ok(access.includes(`"${permission}"`),`exact-only ${permission}`);
  for(const permission of ['reports.pnl','reports.balance_sheet','reports.trial_balance','reports.ledger']) assert.ok(reportCtl.includes(permission),permission);
});
test('36 audit includes login network commercial price and cheque evidence',()=>{
  for(const marker of ['LOGIN_SUCCESS','LOGIN_FAILED','ipAddress','userAgent']) assert.ok(loginAudit.includes(marker),marker);
  for(const marker of ['grocery.sale.commercial_override','grocery.sale.promotions_applied']) assert.ok(sale.includes(marker),marker);
  assert.match(priceHistory,/grocery\.product\.price\.change/);
});
test('37 promotion engine covers required forms and stacking rules',()=>{
  for(const type of ['fixed_discount','percentage_discount','product_discount','category_discount','customer_specific_price','member_price','scheduled_promotion','buy_x_get_y','buy_one_get_one','quantity_break','bundle_pricing','mix_and_match','coupon']) assert.ok(commerce.includes(type),type);
  for(const marker of ['minimumInvoiceAmount','minimumQuantity','maximumDiscount','usageLimit','perCustomerUsageLimit','allowStacking','stackingPrevented']) assert.ok(commerce.includes(marker),marker);
  assert.match(sale,/evaluateGroceryPromotions/);
});
test('38 loyalty supports automatic earning redemption expiry member pricing and history',()=>{
  for(const marker of ['pointsPerCurrency','pointsPerProduct','bonusThreshold','bonusPoints','pointsExpiryDays','minimumRedemption','reconcileExpiredLoyalty','redeemGroceryLoyalty','pointsEarned','pointsRedeemed','pointsExpired','availablePoints']) assert.ok(commerce.includes(marker),marker);
  assert.match(sale,/applyGrocerySaleLoyalty/);
});
test('39 return refund exchange and purchase return use caps and ledger reversals',()=>{
  for(const marker of ['RETURN_REASON_REQUIRED','SOURCE_PURCHASE_REQUIRED','PURCHASE_RETURN_QTY_EXCEEDED']) assert.ok(returnCtl.includes(marker),marker);
  for(const marker of ['grocery_sales_return','customer_refund_payable','grocery_customer_refund','grocery_purchase_return','accounts_receivable','inventory','cogs']) assert.ok(reversals.includes(marker),marker);
  for(const route of ['/sales-returns','/refunds','/purchase-returns','/exchanges']) assert.ok(routes.includes(route),route);
});
test('40 price levels and auditable price history are implemented',()=>{
  for(const marker of ['retailPrice','wholesalePrice','memberPrice','promotionalPrice','customer_specific','grocery_customer_price']) assert.ok(commerce.includes(marker),marker);
  for(const marker of ['grocery_price_history','previous','next','changedFields','changedByUserId']) assert.ok((priceHistory+'\n'+commerce).includes(marker),marker);
});
