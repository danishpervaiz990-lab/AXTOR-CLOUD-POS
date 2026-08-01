import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const purchaseRoutes = fs.readFileSync(new URL("../src/routes/purchases.routes.ts", import.meta.url), "utf8");
const inventoryRoutes = fs.readFileSync(new URL("../src/routes/inventory.routes.ts", import.meta.url), "utf8");

const protectedPurchaseActions = [
  "purchase.request.create",
  "purchase.request.convert",
  "purchase.supplier-payment.create",
  "purchase.return.create",
  "purchase.create",
  "purchase.update",
  "purchase.receive",
  "purchase.cancel",
];

const protectedInventoryActions = [
  "inventory.warehouse.create",
  "inventory.warehouse.update",
  "inventory.warehouse.delete",
  "inventory.adjustment.create",
  "inventory.transfer.create",
  "inventory.stock-count.approve",
];

test("all purchase and payable writes require persistent idempotency", () => {
  assert.match(purchaseRoutes, /router\.use\(requireAuth\)/);
  for (const action of protectedPurchaseActions) {
    assert.match(purchaseRoutes, new RegExp(`requirePersistentIdempotency\\(\\"${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\"\\)`));
  }
});

test("all inventory-changing writes require persistent idempotency", () => {
  assert.match(inventoryRoutes, /router\.use\(requireAuth\)/);
  for (const action of protectedInventoryActions) {
    assert.match(inventoryRoutes, new RegExp(`requirePersistentIdempotency\\(\\"${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\"\\)`));
  }
});

test("inventory read routes remain available without write middleware", () => {
  assert.match(inventoryRoutes, /router\.get\(\"\/stock\",c\.stock\)/);
  assert.match(inventoryRoutes, /router\.get\(\"\/movements\",c\.movements\)/);
  assert.match(inventoryRoutes, /router\.get\(\"\/valuation\",c\.valuation\)/);
});
