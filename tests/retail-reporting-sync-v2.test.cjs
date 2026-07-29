const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const reportHtml = fs.readFileSync(path.join(root, "demo-static", "reports.html"), "utf8");
const reportingJs = fs.readFileSync(path.join(root, "demo-static", "js", "retail-reporting-backend.js"), "utf8");
const salesBootstrap = fs.readFileSync(path.join(root, "demo-static", "js", "salesmen-bootstrap.js"), "utf8");

test("current Retail Reports centre is preserved and enhanced", () => {
  assert.equal(reportHtml.includes('id="reportTable"'), true);
  assert.equal(reportHtml.includes("js/reports-backend.js"), true);
  assert.equal(reportHtml.includes("js/retail-reporting-backend.js"), true);
});

test("Sales overview uses the same authenticated summary as Reports", () => {
  assert.equal(reportingJs.includes("/api/v1/dashboard/summary"), true);
  assert.equal(reportingJs.includes("salesOverviewGross"), true);
  assert.equal(reportingJs.includes("salesTrendChart"), true);
  assert.equal(reportingJs.includes("paymentMixChart"), true);
  assert.equal(reportingJs.includes("salesOverviewTopProductsBody"), true);
  assert.equal(salesBootstrap.includes("retail-reporting-backend.js"), true);
});

test("Reports exposes reconciliation and return-adjusted top products", () => {
  assert.equal(reportingJs.includes("retailTopProductsBody"), true);
  assert.equal(reportingJs.includes("retailReconciliationBody"), true);
  assert.equal(reportingJs.includes("row.returnedQty"), true);
  assert.equal(reportingJs.includes("row.netSales"), true);
  assert.equal(reportingJs.includes("row.profit"), true);
  assert.equal(reportingJs.includes('String(row.result).toUpperCase() === "PASS"'), true);
});
