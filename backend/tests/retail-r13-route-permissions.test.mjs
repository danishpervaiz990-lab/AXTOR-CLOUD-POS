import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(name) {
  return fs.readFileSync(new URL(`../src/routes/${name}.routes.ts`, import.meta.url), "utf8");
}

const routeContracts = [
  ["dashboard", ["dashboard.view"]],
  ["products", ["products.view", "products.manage"]],
  ["customers", ["customers.view", "customers.manage"]],
  ["sales-documents", ["sales_documents.view", "sales_documents.create", "sales_documents.post"]],
  ["payments", ["payments.view", "payments.create"]],
  ["sales-returns", ["sales_documents.view", "sales_documents.return"]],
  ["refunds", ["sales_documents.view", "sales_documents.refund"]],
  ["inventory", ["inventory.view", "inventory.adjust", "inventory.transfer", "inventory.count"]],
  ["purchases", ["purchases.view", "purchases.create", "purchases.receive", "purchases.return", "purchases.pay", "purchases.cancel"]],
  ["suppliers", ["suppliers.view", "suppliers.manage"]],
  ["accounts", ["accounts.view", "accounts.manage", "accounts.reconcile"]],
  ["expenses", ["expenses.view", "expenses.manage"]],
  ["reports", ["reports.view"]],
  ["settings", ["settings.view", "settings.manage", "settings.export"]],
  ["branches", ["branches.view", "branches.manage"]],
  ["shifts", ["shifts.view", "shifts.open", "shifts.close"]],
  ["salesmen", ["salespeople.view", "salespeople.manage", "salespeople.payouts"]],
];

test("R-13 core Retail routes enforce backend permissions", () => {
  for (const [routeName, permissions] of routeContracts) {
    const source = read(routeName);
    assert.match(source, /router\.use\(requireAuth\)|Router\(\)[\s\S]*\.use\(requireAuth\)/, `${routeName} must require authentication`);
    assert.match(source, /permission\.middleware\.js/, `${routeName} must use the shared permission middleware`);
    for (const permission of permissions) {
      assert.match(source, new RegExp(`require(?:Any)?Permission\\([\\s\\S]{0,250}\\"${permission.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\"`), `${routeName} must enforce ${permission}`);
    }
  }
});

test("financial and stock mutations keep persistent idempotency after authorization", () => {
  const criticalRoutes = [
    ["sales-documents", ["sales_document.create", "sales_document.post"]],
    ["payments", ["payment.create"]],
    ["sales-returns", ["sales_return.create"]],
    ["refunds", ["refund.create"]],
    ["inventory", ["inventory.adjustment.create", "inventory.transfer.create", "inventory.stock-count.approve"]],
    ["purchases", ["purchase.create", "purchase.receive", "purchase.return.create", "purchase.supplier-payment.create"]],
  ];

  for (const [routeName, actions] of criticalRoutes) {
    const source = read(routeName);
    for (const action of actions) {
      assert.match(source, new RegExp(`requirePersistentIdempotency\\(\\"${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\"\\)`), `${routeName} must preserve ${action} idempotency`);
    }
  }
});
