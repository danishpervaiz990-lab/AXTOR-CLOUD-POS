import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(new URL("../src/services/retail-reporting.service.ts", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/controllers/dashboard.controller.ts", import.meta.url), "utf8");

test("retail reporting remains tenant scoped and invoice only", () => {
  assert.equal(service.includes("businessId"), true);
  assert.equal(service.includes('documentType: "INVOICE"'), true);
  assert.equal(service.includes('status: { notIn: ["DRAFT", "CANCELLED", "VOID"] }'), true);
  assert.equal(service.includes("refundDate: { gte: period.start, lt: period.end }"), true);
});

test("retail reporting exposes synchronized datasets", () => {
  for (const key of ["salesOverview", "monthlySales", "paymentMix", "topProducts", "reconciliation"]) {
    assert.equal(service.includes(key), true, `missing ${key}`);
  }
  assert.equal(service.includes("Invoice total = paid + outstanding"), true);
  assert.equal(service.includes("Math.abs(equationDifference) <= 0.01"), true);
});

test("dashboard merges the reporting payload and accepts date filters", () => {
  assert.equal(controller.includes("getRetailReportingSummary(businessId, req.query)"), true);
  assert.equal(controller.includes("...dashboard, ...reporting"), true);
});
