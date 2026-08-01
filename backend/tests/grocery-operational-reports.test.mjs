import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("Grocery operational report IDs are PostgreSQL-backed", () => {
  const source = read("../src/services/grocery-reports.service.ts");
  for (const reportId of ["grocery-expiry-risk", "grocery-waste-share", "grocery-recall-share"]) {
    assert.match(source, new RegExp(reportId));
  }
  assert.match(source, /inventoryBatch\.findMany/);
  assert.match(source, /stockMovement\.findMany/);
  assert.match(source, /movementType:\s*"GROCERY_WASTE"/);
  assert.match(source, /industryRecord\.findMany/);
  assert.match(source, /entityType:\s*"grocery_recall"/);
  assert.match(source, /businessId/);
  assert.match(source, /requireGrocery/);
});

test("Reports controller delegates Grocery operational reports", () => {
  const source = read("../src/controllers/reports.controller.ts");
  assert.match(source, /isGroceryOperationalReport/);
  assert.match(source, /runGroceryOperationalReport/);
  assert.match(source, /context\.businessId/);
});
