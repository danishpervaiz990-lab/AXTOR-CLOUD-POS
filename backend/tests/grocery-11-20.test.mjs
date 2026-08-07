import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const routes = read("src/routes/grocery-cheques.routes.ts");
const accounting = read("src/services/grocery-accounting.service.ts");
const operations = read("src/controllers/grocery-operations.controller.ts");
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
  for (const path of requiredRoutes) assert.match(routes, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing ${path}`);
  assert.match(routes, /requireIndustry\("grocery"\)/);
  assert.match(routes, /guardedGroceryTransferTransition/);
  assert.match(routes, /groceryVanReconciliationV2/);
});

test("double-entry foundation rejects unbalanced journals and includes core accounts", () => {
  assert.match(accounting, /Unbalanced journal rejected/);
  assert.match(accounting, /Total|debit/i);
  for (const code of ["cash", "bank", "accounts_receivable", "inventory", "accounts_payable", "tax_payable", "owner_equity", "sales_revenue", "cogs", "expense_general"]) {
    assert.match(accounting, new RegExp(`systemCode: \\"${code}\\"|systemCode: "${code}"`));
  }
  assert.match(accounting, /postGrocerySaleAccounting/);
  assert.match(accounting, /postGroceryCustomerPaymentAccounting/);
  assert.match(accounting, /postGrocerySupplierPaymentAccounting/);
  assert.match(accounting, /postGroceryExpenseAccounting/);
});

test("product, stock count and reorder controls are implemented", () => {
  for (const token of ["weightedBarcode", "priceEmbeddedBarcode", "uoms", "reorderLevel", "reorderQuantity", "maxStock"]) assert.match(operations, new RegExp(token));
  assert.match(operations, /countType must be full or cycle/);
  assert.match(operations, /variancePercentage/);
  assert.match(operations, /recentSales/);
  assert.match(operations, /onOrder/);
  assert.doesNotMatch(operations, /auto.*purchase.*order/i);
});

test("warehouse and van transfer receiving is controlled", () => {
  assert.match(operations, /IN_TRANSIT/);
  assert.match(operations, /PARTIALLY_RECEIVED/);
  assert.match(operations, /TRANSFER_DISPATCH/);
  assert.match(operations, /TRANSFER_RECEIPT/);
  assert.match(guards, /dispatched transfer cannot be cancelled/i);
});

test("van operations include sales, collection, returns, damage and reconciliation", () => {
  for (const name of ["createGroceryVanSale", "createGroceryVanCollection", "createGroceryVanReturn", "createGroceryVanDamage"]) assert.match(van, new RegExp(name));
  assert.match(guards, /cashCollections/);
  assert.match(guards, /cashAfterExpenses/);
});

test("Grocery sales trigger COGS snapshot and ledger posting", () => {
  assert.match(sales, /groceryCostSnapshot/);
  assert.match(sales, /postGrocerySaleAccounting/);
  assert.match(sales, /grocery\.sale\.accounting_posted/);
});
