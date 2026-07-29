const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const reportHtml = fs.readFileSync(path.join(root, "demo-static", "reports.html"), "utf8");
const reportingJs = fs.readFileSync(path.join(root, "demo-static", "js", "retail-reporting-backend.js"), "utf8");
const salesBootstrap = fs.readFileSync(path.join(root, "demo-static", "js", "salesmen-bootstrap.js"), "utf8");

test("reports page is a real reports page rather than a customer page copy", () => {
  assert.equal(reportHtml.includes("<title>Reports · Axtor POS Cloud</title>"), true);
  assert.equal(reportHtml.includes('id="retailReportsRoot"'), true);
  assert.equal(reportHtml.includes('id="retailTopProductsBody"'), true);
  assert.equal(reportHtml.includes('id="retailReconciliationBody"'), true);
  assert.equal(reportHtml.includes('data-bs-target="#customers-list"'), false);
});

test("sales and reports load one canonical tenant-scoped summary", () => {
  assert.equal(reportingJs.includes('/api/v1/dashboard/summary'), true);
  assert.equal(reportingJs.includes("salesOverviewGross"), true);
  assert.equal(reportingJs.includes("retailMonthlySalesChart"), true);
  assert.equal(reportingJs.includes("retailPaymentMixChart"), true);
  assert.equal(reportingJs.includes("topProducts"), true);
  assert.equal(reportingJs.includes("reconciliation"), true);
  assert.equal(salesBootstrap.includes("retail-reporting-backend.js"), true);
});
