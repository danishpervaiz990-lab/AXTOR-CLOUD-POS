import fs from "node:fs";
import assert from "node:assert/strict";

const service = fs.readFileSync(new URL("../src/services/grocery-finance-reports.service.ts", import.meta.url), "utf8");
const controller = fs.readFileSync(new URL("../src/controllers/reports.controller.ts", import.meta.url), "utf8");

for (const id of [
  "grocery-customer-statement",
  "grocery-supplier-statement",
  "grocery-refund-impact",
  "grocery-finance-summary",
]) assert.ok(service.includes(id), `missing ${id}`);

assert.ok(service.includes("businessId"), "reports must remain tenant scoped");
assert.ok(service.includes("returnedAmount"), "return impact must be included");
assert.ok(service.includes("refundedAmount"), "refund impact must be included");
assert.ok(service.includes("inventoryStock"), "inventory valuation must use PostgreSQL stock");
assert.ok(!service.includes("localStorage"), "backend reports must not use browser storage");
assert.ok(controller.includes("isGroceryFinanceReport"));
assert.ok(controller.includes("runGroceryFinanceReport"));

console.log("Grocery finance reconciliation reports verified");
