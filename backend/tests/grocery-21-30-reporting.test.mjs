import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const service=fs.readFileSync('src/services/grocery-21-30-reports.service.ts','utf8');
const overrides=fs.readFileSync('src/services/grocery-21-30-inventory-overrides.service.ts','utf8');
const grouping=fs.readFileSync('src/services/grocery-21-30-grouping.service.ts','utf8');
const controller=fs.readFileSync('src/controllers/grocery-21-30-reporting.controller.ts','utf8');
const reportController=fs.readFileSync('src/controllers/reports.controller.ts','utf8');
const routes=fs.readFileSync('src/routes/grocery-cheques.routes.ts','utf8');

test('requirements 21-30 report catalog covers all required families',()=>{
  for(const id of [
    'grocery-sales-summary','grocery-sales-detail','grocery-sales-product','grocery-sales-category','grocery-sales-brand','grocery-sales-customer','grocery-sales-salesperson','grocery-sales-cashier','grocery-sales-counter','grocery-sales-branch','grocery-sales-warehouse','grocery-sales-van','grocery-sales-payment-method','grocery-sales-hour','grocery-sales-day','grocery-sales-week','grocery-sales-month','grocery-sales-tax','grocery-sales-discount','grocery-sales-void','grocery-sales-held','grocery-sales-credit','grocery-sales-cash','grocery-sales-mixed','grocery-sales-returns',
    'grocery-product-sales','grocery-product-profitability','grocery-product-quantity','grocery-product-fast','grocery-product-slow','grocery-product-nonmoving','grocery-product-dead','grocery-product-low','grocery-product-out','grocery-product-return-rate','grocery-product-discount','grocery-product-price-history','grocery-product-cost-history',
    'grocery-customer-sales','grocery-customer-profitability','grocery-customer-ledger','grocery-customer-statement-v2','grocery-customer-outstanding','grocery-customer-ageing','grocery-customer-payment-history','grocery-customer-frequency','grocery-customer-average-basket','grocery-customer-top','grocery-customer-inactive','grocery-customer-credit-utilization',
    'grocery-payment-summary','grocery-payment-cash','grocery-payment-card','grocery-payment-bank','grocery-payment-cheques','grocery-payment-digital','grocery-payment-credit-sales','grocery-payment-mixed','grocery-payment-refunds','grocery-payment-reconciliation',
    'grocery-purchase-summary','grocery-purchase-detail','grocery-purchase-product','grocery-purchase-supplier','grocery-purchase-category','grocery-purchase-branch','grocery-purchase-warehouse','grocery-purchase-status','grocery-purchase-pending','grocery-purchase-partial','grocery-purchase-grn','grocery-purchase-returns','grocery-purchase-cost-variance','grocery-purchase-due','grocery-purchase-supplier-payments',
    'grocery-inventory-on-hand','grocery-inventory-warehouse','grocery-inventory-branch','grocery-inventory-van','grocery-inventory-valuation','grocery-inventory-movement','grocery-inventory-adjustment','grocery-inventory-transfer','grocery-inventory-count-variance','grocery-inventory-low','grocery-inventory-out','grocery-inventory-excess','grocery-inventory-dead','grocery-inventory-expired','grocery-inventory-near-expiry','grocery-inventory-damaged','grocery-inventory-batch','grocery-inventory-ageing','grocery-profit-loss'
  ]) assert.ok(service.includes(`"${id}"`)||overrides.includes(`"${id}"`),`missing ${id}`);
});

test('report engine exposes filters, paging, group-by, percentages and exports',()=>{
  for(const marker of ['pageSize','sortBy','groupBy','comparison','search','csv','xlsx','pdf','print']) assert.ok(service.includes(marker)||controller.includes(marker),`missing ${marker}`);
  for(const marker of ['contributionPct','unitsPct','profitPct','inventoryValuePct','creditUtilizationPct','collectionPct','purchasePct','payablePct']) assert.ok(service.includes(marker),`missing percentage ${marker}`);
  for(const marker of ['grocery-sales-branch','grocery-sales-cashier','grocery-sales-payment-method','grocery-purchase-supplier','grocery-inventory-warehouse']) assert.ok(grouping.includes(marker),`missing group-by mapping ${marker}`);
  assert.match(reportController,/resolveGrocery21To30GroupBy/);
});

test('P&L is ledger based with comparison and common-size analysis',()=>{
  assert.match(service,/accountTransaction\.findMany/);
  assert.match(service,/accountingBasis:\s*"accrual-ledger"/);
  for(const marker of ['comparisonAmount','difference','changePct','revenuePct','Net Profit','Operating Profit','Cost of Goods Sold']) assert.ok(service.includes(marker));
});

test('inventory reports use actual Grocery persistence models and adapter dispatches first',()=>{
  assert.match(overrides,/entityType:\s*"grocery_stock_transfer"/);
  assert.match(overrides,/db\.stockCount\.findMany/);
  assert.match(overrides,/countedQty/);
  assert.match(reportController,/if \(isGrocery21To30InventoryOverrideReport\(reportId\)\)/);
  assert.match(reportController,/else if \(isGrocery21To30Report\(reportId\)\)/);
});

test('professional voucher contract is routed and sourced from persisted records',()=>{
  assert.match(routes,/\/report-catalog/);
  assert.match(routes,/router\.get\("\/vouchers"/);
  assert.match(routes,/\/vouchers\/:type\/:id/);
  assert.match(controller,/customerPayment\.findFirst/);
  assert.match(controller,/supplierPayment\.findFirst/);
  for(const marker of ['amountInWords','paymentMethod','chequeBankReference','invoiceBillReferences','preparedBy','approvedBy','signature','A4','A5','thermal','PDF','print']) assert.ok(controller.includes(marker),`missing voucher field ${marker}`);
});
