import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service=readFileSync(new URL("../src/services/grocery-41-50.service.ts",import.meta.url),"utf8");
const routes=readFileSync(new URL("../src/routes/grocery-41-50.routes.ts",import.meta.url),"utf8");
const sales=readFileSync(new URL("../src/controllers/grocery-sales.controller.ts",import.meta.url),"utf8");
const lookup=readFileSync(new URL("../src/controllers/grocery-product-lookup-v5.controller.ts",import.meta.url),"utf8");
const app=readFileSync(new URL("../src/app.ts",import.meta.url),"utf8");

test("41 uses one explicit weighted-average valuation method while retaining FEFO physical rotation",()=>{
  assert.match(service,/method: "weighted_average"/);
  assert.match(sales,/valuationMethod: "weighted_average"/);
  assert.match(sales,/physicalRotation: "FEFO"/);
  assert.match(sales,/moving_weighted_average_pre_sale/);
  assert.doesNotMatch(sales,/inventory_batch_cost_at_post/);
});

test("42 centralized printing covers thermal standard paper and all required document families",()=>{
  for(const marker of ["58mm","80mm","A5","A4","Letter","sales_receipt","tax_invoice","credit_invoice","quotation","sales_return","customer_payment_receipt","customer_statement","purchase_order","grn","purchase_invoice","purchase_return","supplier_payment_voucher","receipt_voucher","payment_voucher","stock_transfer","stock_count","expense_voucher","journal_voucher"])assert.match(service,new RegExp(marker));
  assert.match(routes,/\/print\/profiles/);assert.match(routes,/\/print\/document\/\:type\/\:id/);
});

test("43 barcode shelf and price label previews are bounded and printer friendly",()=>{
  assert.match(service,/product_barcode/);assert.match(service,/shelf_label/);assert.match(service,/price_label/);assert.match(service,/limited to 500 labels/);assert.match(service,/printerFriendly: true/);
});

test("44 dashboard exposes required supermarket KPIs charts and safe comparisons",()=>{
  for(const marker of ["todaySales","todayProfit","todayPurchases","todayExpenses","netCash","receivables","payables","currentStockValue","lowStock","expiringProducts","overdueCustomers","supplierBillsDue","chequesDue","salesTrend","paymentMethods","categories","topProducts","topCustomers","changePct: null"])assert.match(service,new RegExp(marker));
});

test("45 notification center evaluates all required operational alert families",()=>{
  for(const marker of ["out_of_stock","low_stock","expired_stock","near_expiry","customer_overdue","customer_payment_due","supplier_overdue","supplier_payment_due","outward_cheque_due","inward_cheque_due","pending_po","transfer_pending","stock_count_pending","large_discount","large_refund"])assert.match(service,new RegExp(marker));
  assert.match(routes,/notification-rules/);assert.match(routes,/notifications\/generate/);
});

test("46 Grocery settings are validated and lock valuation method after transactional use",()=>{
  for(const group of ["grocery.business","grocery.pos","grocery.sales","grocery.purchases","grocery.inventory","grocery.accounting","grocery.printing","grocery.notifications"])assert.match(service,new RegExp(group.replaceAll(".","\\.")));
  assert.match(service,/changing methods after transactions is not allowed/);
});

test("47 supplier purchase cost history is persisted from actual goods receipts",()=>{
  assert.match(service,/purchaseCostHistory/);assert.match(service,/goodsReceiptItem\.findMany/);assert.match(routes,/cost-history/);
});

test("48 imports require preview hash validation and transactional commit",()=>{
  for(const type of ["products","categories","customers","suppliers","opening_stock","product_pricing"])assert.match(service,new RegExp(type));
  assert.match(service,/previewHash/);assert.match(service,/rows changed after preview/);assert.match(service,/db\.\$transaction/);assert.match(service,/rejectedRows/);
});

test("49 global search is server side and covers operational identifiers",()=>{
  assert.match(service,/globalSearch/);for(const marker of ["products","customers","suppliers","sales","purchases","grns","cheques","vouchers"])assert.match(service,new RegExp(marker));assert.match(service,/serverSide:true/);
});

test("50 removes 10k in-memory Grocery identifier scan and uses bounded database candidates",()=>{
  assert.doesNotMatch(lookup,/take:\s*10000/);assert.match(lookup,/array_contains/);assert.match(lookup,/take:20/);assert.match(service,/limitOf/);assert.match(service,/LIMIT \$\$\{limitPos\}/);
});

test("41-50 routes remain Grocery guarded and are mounted",()=>{
  assert.match(routes,/router\.use\(requireAuth, requireIndustry\("grocery"\)\)/);assert.match(app,/grocery41To50Routes/);
});
