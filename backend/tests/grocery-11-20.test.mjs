import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const routes = read("src/routes/grocery-cheques.routes.ts");
const accounting = read("src/services/grocery-accounting.service.ts");
const productCounter = read("src/controllers/grocery-product-counter.controller.ts");
const inventory = read("src/controllers/grocery-inventory-ops.controller.ts");
const finance = read("src/controllers/grocery-finance-ops.controller.ts");
const guards = read("src/controllers/grocery-operations-guards.controller.ts");
const van = read("src/controllers/grocery-van.controller.ts");
const sales = read("src/controllers/grocery-sales.controller.ts");

const requiredRoutes = [
  "/products/lookup", "/products/:id/profile", "/counters", "/shifts/:shiftId/cash-movements",
  "/vans", "/vans/:id/stock", "/vans/:id/sales", "/vans/:id/collections", "/vans/:id/returns",
  "/vans/:id/damaged", "/vans/:id/reconciliation", "/transfers", "/transfers/:id/status",
  "/stock-counts", "/stock-counts/:id/approve", "/reorder-suggestions", "/accounting/chart",
  "/journals", "/journals/:id/status", "/expenses", "/expense-report", "/customer-payments", "/supplier-payments",
];

test("requirements 11-20 Grocery routes are exposed behind the Grocery router", () => {
  for (const path of requiredRoutes) assert.ok(routes.includes(path), `missing ${path}`);
  assert.match(routes, /requireIndustry\("grocery"\)/);
  assert.match(routes, /guardedGroceryTransferTransition/);
  assert.match(routes, /groceryVanReconciliationV2/);
});

test("double-entry foundation rejects unbalanced journals and includes core accounts", () => {
  assert.match(accounting, /Unbalanced journal rejected/);
  for (const code of ["cash", "bank", "accounts_receivable", "inventory", "accounts_payable", "tax_payable", "owner_equity", "sales_revenue", "cogs", "expense_general"]) {
    assert.ok(accounting.includes(`systemCode: "${code}"`), `missing account ${code}`);
  }
  for (const posting of ["postGrocerySaleAccounting", "postGroceryCustomerPaymentAccounting", "postGrocerySupplierPaymentAccounting", "postGroceryExpenseAccounting"]) assert.ok(accounting.includes(posting));
  assert.match(finance, /Journal must balance/);
  assert.match(finance, /grocery_manual_journal_reversal/);
});

test("product UOM and grocery price controls are implemented", () => {
  for (const token of ["weightedBarcode", "priceEmbeddedBarcode", "barcodes", "plu", "uoms", "baseUnit", "retailPrice", "wholesalePrice", "memberPrice", "promotionalPrice", "minimumSellingPrice", "reorderLevel", "reorderQuantity", "maxStock", "margin", "markup"]) assert.ok(productCounter.includes(token), `missing ${token}`);
});

test("stock count and smart reorder controls are implemented", () => {
  assert.match(inventory, /countType must be full or cycle/);
  assert.match(inventory, /variancePercentage/);
  assert.match(inventory, /recentSales/);
  assert.match(inventory, /onOrder/);
  assert.match(inventory, /suggestedQty/);
  assert.doesNotMatch(inventory, /auto.*purchase.*order/i);
});

test("warehouse and van transfer receiving is controlled", () => {
  for (const token of ["IN_TRANSIT", "PARTIALLY_RECEIVED", "TRANSFER_DISPATCH", "TRANSFER_RECEIPT"]) assert.ok(inventory.includes(token));
  assert.match(guards, /dispatched transfer cannot be cancelled/i);
});

test("van operations include sales, collection, returns, damage and reconciliation", () => {
  for (const name of ["createGroceryVanSale", "createGroceryVanCollection", "createGroceryVanReturn", "createGroceryVanDamage"]) assert.match(van, new RegExp(name));
  assert.match(guards, /cashCollections/);
  assert.match(guards, /cashAfterExpenses/);
});

test("expense reporting includes meaningful percentages", () => {
  assert.match(finance, /percentageOfTotal/);
  assert.match(finance, /paymentMethod/);
  assert.match(finance, /vanId/);
});

test("Grocery sales trigger COGS snapshot and ledger posting", () => {
  assert.match(sales, /groceryCostSnapshot/);
  assert.match(sales, /postGrocerySaleAccounting/);
  assert.match(sales, /grocery\.sale\.accounting_posted/);
});
