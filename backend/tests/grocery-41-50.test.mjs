import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const service=[read("../src/services/grocery-41-50.service.ts"),read("../src/services/grocery-41-50-valuation.service.ts"),read("../src/services/grocery-41-50-print.service.ts"),read("../src/services/grocery-41-50-print-profile.service.ts"),read("../src/services/grocery-41-50-ops.service.ts"),read("../src/services/grocery-41-50-notifications.service.ts"),read("../src/services/grocery-41-50-data.service.ts")].join("\n");
const routes=read("../src/routes/grocery-41-50.routes.ts");
const sales=read("../src/controllers/grocery-sales.controller.ts");
const lookup=read("../src/controllers/grocery-product-lookup-v5.controller.ts");
const app=read("../src/app.ts");

test("41 uses one explicit weighted-average valuation method while retaining FEFO physical rotation",()=>{
  assert.match(service,/method:"weighted_average"/);
  assert.match(sales,/valuationMethod: "weighted_average"/);
  assert.match(sales,/physicalRotation: "FEFO"/);
  assert.match(sales,/moving_weighted_average_pre_sale/);
  assert.doesNotMatch(sales,/inventory_batch_cost_at_post/);
});

test("42 centralized printing covers thermal standard paper and all required document families",()=>{
  for(const marker of ["58mm","80mm","A5","A4","Letter","sales_receipt","tax_invoice","credit_invoice","quotation","sales_return","customer_payment_receipt","customer_statement","purchase_order","grn","purchase_invoice","purchase_return","supplier_payment_voucher","receipt_voucher","payment_voucher","stock_transfer","stock_count","expense_voucher","journal_voucher"])assert.ok(service.includes(marker),`missing print contract ${marker}`);
  assert.match(routes,/\/print\/profiles/);assert.match(routes,/\/print\/document\/\:type\/\:id/);assert.ok(service.includes("profileCode"));assert.ok(service.includes("return{...document,profile}"));
});

test("43 barcode shelf and price label previews are bounded and printer friendly",()=>{
  for(const marker of ["product_barcode","shelf_label","price_label","limited to 500 labels","printerFriendly:true"])assert.ok(service.includes(marker),`missing label contract ${marker}`);
});

test("44 dashboard exposes required supermarket KPIs charts and safe comparisons",()=>{
  for(const marker of ["todaySales","todayProfit","todayPurchases","todayExpenses","netCash","receivables","payables","currentStockValue","lowStock","expiringProducts","overdueCustomers","supplierBillsDue","chequesDue","salesTrend","paymentMethods","categories","topProducts","topCustomers","salesVsPreviousMonth","changePct:null"])assert.ok(service.includes(marker),`missing dashboard contract ${marker}`);
});

test("45 notification center evaluates all required operational alert families and configured thresholds",()=>{
  for(const marker of ["out_of_stock","low_stock","expired_stock","near_expiry","customer_overdue","customer_payment_due","supplier_overdue","supplier_payment_due","outward_cheque_due","inward_cheque_due","pending_po","transfer_pending","stock_count_pending","large_discount","large_refund","lowStockThreshold","GREATEST(min_stock,$2::numeric)"])assert.ok(service.includes(marker),`missing notification contract ${marker}`);
  assert.match(routes,/notification-rules/);assert.match(routes,/notifications\/generate/);
});

test("46 Grocery settings are validated and lock valuation method after transactional use",()=>{
  for(const group of ["grocery.business","grocery.pos","grocery.sales","grocery.purchases","grocery.inventory","grocery.accounting","grocery.printing","grocery.notifications"])assert.ok(service.includes(group),`missing settings group ${group}`);
  assert.ok(service.includes("changing methods after transactions is not allowed"));
});

test("47 supplier purchase cost history is persisted from actual goods receipts",()=>{
  assert.ok(service.includes("purchaseCostHistory"));assert.ok(service.includes("goodsReceiptItem.findMany"));assert.match(routes,/cost-history/);
});

test("48 imports require preview hash validation, rejected-row reporting and transactional commit",()=>{
  for(const type of ["products","categories","customers","suppliers","opening_stock","product_pricing"])assert.ok(service.includes(type),`missing import type ${type}`);
  for(const marker of ["previewHash","rows changed after preview","db.$transaction","rejectedRows","grocery_price_history"])assert.ok(service.includes(marker),`missing import safety ${marker}`);
});

test("49 global search is server side and covers operational identifiers",()=>{
  assert.ok(service.includes("globalSearch"));for(const marker of ["products","customers","suppliers","sales","purchases","grns","cheques","vouchers","voucherNo","serverSide:true"])assert.ok(service.includes(marker),`missing global-search contract ${marker}`);
});

test("50 removes 10k in-memory Grocery identifier scan and uses bounded database candidates",()=>{
  assert.doesNotMatch(lookup,/take:\s*10000/);assert.ok(lookup.includes("array_contains"));assert.ok(lookup.includes("take:20"));assert.ok(service.includes("limitOf"));assert.ok(service.includes("LIMIT $${limitPos}"));assert.ok(service.includes("LIMIT 2000"));
});

test("41-50 routes remain Grocery guarded and bounded lookup is mounted before the legacy Grocery router",()=>{
  assert.match(routes,/router\.use\(requireAuth, requireIndustry\("grocery"\)\)/);
  const bounded='app.use("/api/v1/grocery", grocery41To50Routes);';
  const legacy='app.use("/api/v1/grocery", groceryRoutes);';
  assert.ok(app.includes(bounded)&&app.includes(legacy));
  assert.ok(app.indexOf(bounded)<app.indexOf(legacy),"bounded Grocery 41-50 router must precede legacy Grocery router");
});
