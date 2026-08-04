import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const activation = await import("../dist/industry/activate-launch-ready-packs.js");
const registryModule = await import("../dist/industry/registry.js");

const launchService = fs.readFileSync(new URL("../src/services/public-catalog-launch.service.ts", import.meta.url), "utf8");
const controller = fs.readFileSync(new URL("../src/controllers/public-catalog.controller.ts", import.meta.url), "utf8");
const seed = fs.readFileSync(new URL("../src/scripts/seed-commercial-catalog.ts", import.meta.url), "utf8");
const releaseC = fs.readFileSync(new URL("../src/routes/release-c.routes.ts", import.meta.url), "utf8");
const releaseD = fs.readFileSync(new URL("../src/routes/release-d.routes.ts", import.meta.url), "utf8");
const manufacturing = fs.readFileSync(new URL("../src/routes/manufacturing.routes.ts", import.meta.url), "utf8");

const expectedCodes = [
  "retail", "grocery", "pharmacy", "hardware", "paint", "gym", "clinic",
  "restaurant", "furniture", "school", "workshop", "wholesale", "manufacturing",
];

test("all 13 industries satisfy the executable launch-readiness contract", () => {
  assert.deepEqual([...activation.ONBOARDING_READY_INDUSTRY_CODES], expectedCodes);
  assert.doesNotThrow(() => activation.assertAllIndustriesLaunchReady());

  for (const code of expectedCodes) {
    const pack = registryModule.INDUSTRY_REGISTRY[code];
    assert.ok(pack, `${code} pack must exist`);
    const result = activation.industryLaunchReadiness(pack);
    assert.equal(result.ready, true, `${code} readiness failed: ${result.errors.join(", ")}`);
    assert.equal(pack.operationalStatus, "core_ready");
    assert.equal(pack.registrationEnabled, true);
    assert.ok(pack.modules.length > 0, `${code} modules missing`);
    assert.ok(pack.sidebarOrder.length > 0, `${code} sidebar missing`);
    assert.ok(pack.dashboardWidgets.length > 0, `${code} dashboard widgets missing`);
    assert.ok(Object.keys(pack.defaultRoles).length > 0, `${code} default roles missing`);
    assert.ok(Object.keys(pack.defaultSettings).length > 0, `${code} settings missing`);
    assert.ok(pack.notificationRules.length > 0, `${code} notification rules missing`);
    assert.ok(pack.printFields.length > 0, `${code} print fields missing`);
    assert.ok(pack.reports.length > 0, `${code} reports missing`);
  }
});

test("catalogue and registration use readiness, not a six-industry allowlist", () => {
  assert.match(controller, /public-catalog-launch\.service/);
  assert.match(launchService, /ONBOARDING_READY_INDUSTRY_CODES/);
  assert.match(launchService, /industryLaunchReadiness/);
  assert.match(launchService, /Available for production onboarding/);
  assert.doesNotMatch(launchService, /new Set\(\["retail", "grocery", "pharmacy", "gym", "clinic", "school"\]\)/);
  assert.doesNotMatch(launchService, /INDUSTRY_PREVIEW_ONLY/);
});

test("new tenants receive operational roles and persisted launch configuration", () => {
  assert.match(launchService, /Object\.entries\(pack\.defaultRoles\)/);
  assert.match(launchService, /findSystemRoleDefinition\(roleName\)/);
  assert.match(launchService, /canonical\?\.permissions/);
  assert.match(launchService, /Default \$\{pack\.name\} operational role/);
  for (const key of ["industry.defaults", "industry.modules", "industry.reports", "industry.printing", "industry.forms", "industry.launch"]) {
    assert.match(launchService, new RegExp(key.replaceAll(".", "\\.")));
  }
  assert.match(launchService, /pack\.notificationRules/);
  assert.match(launchService, /pack\.printFields/);
  assert.match(launchService, /rolePresetCount/);
  assert.match(launchService, /formSchemaCount/);
  assert.match(launchService, /tenant\.provisioned/);
  assert.match(launchService, /cleanupProvisioningBusiness/);
  assert.match(launchService, /status: "SUSPENDED"/);
  assert.match(launchService, /onboardingState: "IN_PROGRESS"/);
  assert.match(launchService, /status: "TRIAL"/);
  assert.doesNotMatch(launchService, /prisma\.\$transaction\s*\(\s*async/);
  assert.match(launchService, /Idempotency-Key/);
});

test("registration hashes credentials before the first database write", () => {
  const hashIndex = launchService.indexOf("const ownerPasswordHash = hashPassword(password)");
  const firstWriteIndex = launchService.indexOf("let business = await prisma.business.create");
  assert.ok(hashIndex >= 0, "owner password hash must be derived");
  assert.ok(firstWriteIndex > hashIndex, "password hashing must finish before provisioning starts");
  assert.match(launchService, /passwordHash: ownerPasswordHash/);
  assert.doesNotMatch(launchService, /passwordHash: hashPassword\(password\)/);
  assert.match(launchService, /createdBusinessId = business\.id/);
  assert.match(launchService, /cleanupSucceeded/);
});

test("catalogue seeding activates all industry rows and feature contracts", () => {
  assert.match(seed, /activate-launch-ready-packs/);
  assert.match(seed, /publicIndustryRegistry\(\)/);
  assert.match(seed, /active: true/);
  assert.match(seed, /industryFeature\.upsert/);
});

test("preview industries have authenticated routes, writes and reports", () => {
  for (const marker of [
    "restaurantRouter.post", "restaurantRouter.patch", "restaurantRouter.get(\"/reports\"",
    "hardwareRouter.post", "hardwareRouter.get(\"/reports\"",
    "paintRouter.post", "paintRouter.patch", "paintRouter.get(\"/reports\"",
  ]) assert.ok(releaseC.includes(marker), `Release C marker missing: ${marker}`);

  for (const marker of [
    "furnitureRouter.post", "furnitureRouter.patch", "furnitureRouter.get(\"/reports\"",
    "workshopRouter.post", "workshopRouter.get(\"/reports\"",
    "wholesaleRouter.post", "wholesaleRouter.patch", "wholesaleRouter.get(\"/reports\"",
  ]) assert.ok(releaseD.includes(marker), `Release D marker missing: ${marker}`);

  assert.match(manufacturing, /manufacturingRouter\.post/);
  assert.match(manufacturing, /reports/);
  assert.match(releaseC, /requireAuth/);
  assert.match(releaseD, /requireAuth/);
  assert.match(releaseC, /requireIndustry/);
  assert.match(releaseD, /requireIndustry/);
});
