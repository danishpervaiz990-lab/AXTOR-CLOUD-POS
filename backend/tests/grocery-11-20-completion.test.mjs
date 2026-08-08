import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const routes = read("src/routes/grocery-cheques.routes.ts");
const completion = read("src/controllers/grocery-11-20-completion.controller.ts");

test("counter creation and cashier assignment are exposed server-side", () => {
  for (const token of ["/cashiers", 'router.post("/counters"', 'router.patch("/counters/:id"']) assert.ok(routes.includes(token), token);
  assert.match(completion, /cashierUserId/);
  assert.match(completion, /grocery\.counter\.create/);
  assert.match(completion, /assignedCashierName/);
});

test("van physical closing records quantity and value variance", () => {
  assert.ok(routes.includes('/vans/:id/closing-counts'));
  assert.ok(routes.includes('/vans/:id/closing-counts/latest'));
  assert.match(completion, /expectedQuantity/);
  assert.match(completion, /physicalQuantity/);
  assert.match(completion, /varianceQuantity/);
  assert.match(completion, /varianceValue/);
  assert.match(completion, /variancePercentage/);
  assert.match(completion, /postAdjustment/);
});

test("expense reporting covers day/month/branch/user/method/van and templates", () => {
  for (const token of ['groupBy === "date"', 'groupBy === "month"', 'groupBy === "branch"', 'groupBy === "user"', 'groupBy === "paymentMethod"', 'groupBy === "van"']) assert.ok(completion.includes(token), token);
  assert.ok(routes.includes('/expense-templates'));
  assert.match(completion, /weekly/);
  assert.match(completion, /monthly/);
  assert.match(completion, /quarterly/);
  assert.match(completion, /yearly/);
  assert.match(completion, /percentageOfTotal/);
});

test("all completion routes remain behind Grocery auth/industry guard and permissions", () => {
  assert.match(routes, /router\.use\(requireAuth, requireIndustry\("grocery"\)\)/);
  assert.match(routes, /locationManage, createGroceryCounter/);
  assert.match(routes, /requireAnyPermission\("inventory\.count", "inventory\.adjust"\), createGroceryVanClosingCount/);
  assert.match(routes, /requirePermission\("expenses\.manage"\), createGroceryExpenseTemplate/);
});
