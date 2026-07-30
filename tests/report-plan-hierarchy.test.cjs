const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "demo-static", "reports.html"), "utf8");
const script = fs.readFileSync(path.join(root, "demo-static", "js", "report-plan-hierarchy.js"), "utf8");

test("Reports loads the entitlement hierarchy compatibility before report rendering", () => {
  const hierarchy = html.indexOf("js/report-plan-hierarchy.js");
  const reportBackend = html.indexOf("js/reports-backend.js");
  assert.ok(hierarchy >= 0, "hierarchy script is missing");
  assert.ok(reportBackend > hierarchy, "hierarchy script must load before reports backend");
  assert.equal(html.includes("20260730-report-hierarchy1"), true);
});

test("higher report tiers inherit the daily-sales entry feature", () => {
  for (const feature of ["reports.standard", "reports.advanced", "reports.*", "*"]) {
    assert.equal(script.includes(`\"${feature}\"`), true, `missing ${feature}`);
  }
  assert.equal(script.includes('REPORT_ENTRY_FEATURE = "reports.daily_sales"'), true);
});

test("compatibility removes only the incorrect report plan block", () => {
  assert.equal(script.includes('classList.contains("axtor-plan-block")'), true);
  assert.equal(script.includes("Unavailable on your current plan"), true);
  assert.equal(script.includes("hasInheritedReportAccess(context)"), true);
  assert.equal(script.includes("element.remove()"), true);
});
