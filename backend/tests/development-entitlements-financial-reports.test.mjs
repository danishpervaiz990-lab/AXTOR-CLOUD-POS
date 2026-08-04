import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entitlements = readFileSync(new URL("../src/services/entitlements.service.ts", import.meta.url), "utf8");
const financialReports = readFileSync(new URL("../src/services/financial-movement-reports.service.ts", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/controllers/reports.controller.ts", import.meta.url), "utf8");

test("subscription plans remain opt-in during development", () => {
  assert.match(entitlements, /AXTOR_ENFORCE_SUBSCRIPTION_PLANS/);
  assert.match(entitlements, /features\["\*"\] = \{ enabled: true, limit: null \}/);
  assert.match(entitlements, /if \(!subscriptionPlansEnforced\(\)\) return;/);
  assert.match(entitlements, /Authentication, tenant isolation and role/);
});

test("feature wildcard inheritance remains available when enforcement is enabled", () => {
  assert.match(entitlements, /context\.features\[`\$\{segments\.join\("\."\)\}\.\*`\]\?\.enabled/);
  assert.match(entitlements, /context\.features\["\*"\]\?\.enabled/);
});

test("financial movement reports expose requested debit credit and method views", () => {
  assert.match(financialReports, /Debit \/ Credit Transaction Ledger/);
  assert.match(financialReports, /Payments \/ Receipts by Method/);
  for (const method of ["cash", "online \/ bank transfer", "pos \/ card", "cheque", "debit card", "credit card"]) {
    assert.match(financialReports, new RegExp(method.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(financialReports, /runningBalance/);
  assert.match(financialReports, /customerPayment\.findMany/);
  assert.match(financialReports, /supplierPayment\.findMany/);
  assert.match(financialReports, /customerRefund\.findMany/);
  assert.match(financialReports, /expense\.findMany/);
});

test("reports controller routes the new reports before industry-specific handlers", () => {
  assert.match(controller, /isFinancialMovementReport/);
  assert.match(controller, /runFinancialMovementReport/);
  assert.ok(controller.indexOf("isFinancialMovementReport") < controller.indexOf("isGroceryOperationalReport"));
});
