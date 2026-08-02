import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1";
const launchCodes = ["hardware", "paint", "restaurant", "furniture", "workshop", "wholesale", "manufacturing"];
const routeByIndustry = {
  hardware: { dashboard: "/api/v1/hardware/dashboard", reports: "/api/v1/hardware/reports" },
  paint: { dashboard: "/api/v1/paint/dashboard", reports: "/api/v1/paint/reports" },
  restaurant: { dashboard: "/api/v1/restaurant/dashboard", reports: "/api/v1/restaurant/reports" },
  furniture: { dashboard: "/api/v1/furniture/dashboard", reports: "/api/v1/furniture/reports" },
  workshop: { dashboard: "/api/v1/workshop/dashboard", reports: "/api/v1/workshop/reports" },
  wholesale: { dashboard: "/api/v1/wholesale/dashboard", reports: "/api/v1/wholesale/reports" },
  manufacturing: { dashboard: "/api/v1/manufacturing/dashboard", reports: "/api/v1/manufacturing/reports" },
};

function sampleField(field, seed) {
  if (field.type === "number") return 1;
  if (field.type === "boolean") return true;
  if (field.type === "date") return "2026-08-01";
  if (field.type === "datetime") return "2026-08-01T09:00:00.000Z";
  if (field.type === "select") return field.options?.[0] || "active";
  if (field.type === "textarea") return `Test data ${seed}`;
  return `${field.key}-${seed}`;
}

function recordPayload(pack, seed) {
  const entity = pack.entities[0];
  assert.ok(entity, `${pack.code} requires at least one launch form schema`);
  const data = {};
  for (const field of entity.fields) {
    if (field.required) data[field.key] = sampleField(field, seed);
  }
  return {
    entity,
    body: {
      entityType: entity.type,
      status: entity.statuses[0],
      displayName: `${pack.name} launch record`,
      data,
    },
  };
}

async function request(base, path, options = {}) {
  const response = await fetch(base + path, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

test("all preview packs provision, authenticate, store forms and serve reports", { skip: !RUN, timeout: 120_000 }, async () => {
  const [{ createApp }, { prisma }, { INDUSTRY_REGISTRY }] = await Promise.all([
    import("../dist/app.js"),
    import("../dist/db/prisma.js"),
    import("../dist/industry/registry.js"),
    import("../dist/industry/activate-launch-ready-packs.js"),
  ]);
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const createdBusinessIds = [];
  const createdRecords = [];

  try {
    const catalogResult = await request(base, "/api/v1/public/catalog", { headers: { Accept: "application/json" } });
    assert.equal(catalogResult.response.status, 200);
    const catalog = catalogResult.body?.data;
    assert.equal(catalog?.industries?.length, 13);
    assert.deepEqual(catalog.industries.filter(item => !item.canRegister).map(item => item.code), []);

    for (const [index, industryCode] of launchCodes.entries()) {
      const pack = INDUSTRY_REGISTRY[industryCode];
      assert.ok(pack, `${industryCode} registry missing`);
      const suffix = `${Date.now()}-${index}`;
      const registration = await request(base, "/api/v1/public/register", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": `launch:${industryCode}:${suffix}`,
        },
        body: JSON.stringify({
          businessName: `Launch ${pack.name} ${suffix}`,
          ownerName: "Launch Owner",
          email: `launch-${industryCode}-${suffix}@example.test`,
          password: "LaunchReady#2026",
          country: "QA",
          timezone: "Asia/Qatar",
          baseCurrency: "QAR",
          language: "en",
          industryCode,
          planCode: "professional",
          billingCycle: "MONTHLY",
          firstBranch: "Main Branch",
          firstWarehouse: "Main Warehouse",
          firstCounter: "Counter 1",
          taxSystem: "none",
          taxLabel: "Tax",
          invoicePrefix: "INV",
          printProfile: "a4",
          pricesIncludeTax: false,
          sampleDataRequested: false,
          acceptTerms: true,
          acceptPrivacy: true,
        }),
      });
      assert.equal(registration.response.status, 201, `${industryCode} registration failed: ${JSON.stringify(registration.body)}`);
      const result = registration.body?.data;
      assert.equal(result?.industry?.code, industryCode);
      assert.equal(result?.industry?.operationalStatus, "core_ready");
      assert.ok(result?.auth?.token, `${industryCode} owner session missing`);
      assert.equal(result?.auth?.user?.role, "Owner");
      assert.ok(result?.provisioning?.counterId);
      assert.equal(result?.provisioning?.rolePresetCount, Object.keys(pack.defaultRoles).length);
      createdBusinessIds.push(result.business.id);

      const auth = { Accept: "application/json", Authorization: `Bearer ${result.auth.token}` };
      const me = await request(base, "/api/v1/auth/me", { headers: auth });
      assert.equal(me.response.status, 200, `${industryCode} auth/me failed`);

      const [roleCount, settings, printProfiles, notificationCount, selection] = await Promise.all([
        prisma.role.count({ where: { businessId: result.business.id } }),
        prisma.industrySetting.findMany({ where: { businessId: result.business.id }, orderBy: { key: "asc" } }),
        prisma.printProfile.count({ where: { businessId: result.business.id } }),
        prisma.notificationRule.count({ where: { businessId: result.business.id } }),
        prisma.businessIndustry.findUnique({ where: { businessId: result.business.id }, include: { industry: true } }),
      ]);
      assert.equal(roleCount, 1 + Object.keys(pack.defaultRoles).length, `${industryCode} role presets incomplete`);
      assert.deepEqual(settings.map(row => row.key), ["industry.defaults", "industry.forms", "industry.launch", "industry.modules", "industry.printing", "industry.reports"]);
      assert.equal(printProfiles, 3);
      assert.equal(notificationCount, pack.notificationRules.length);
      assert.equal(selection?.industry.code, industryCode);
      assert.equal(selection?.provisioningState, "completed");

      const registry = await request(base, "/api/v1/industry/registry", { headers: auth });
      assert.equal(registry.response.status, 200, `${industryCode} registry failed`);
      assert.equal(registry.body?.data?.selected?.code, industryCode);
      assert.ok(registry.body?.data?.selected?.reports?.length > 0);

      const { entity, body } = recordPayload(pack, suffix);
      const recordResult = await request(base, "/api/v1/industry/records", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json", "Idempotency-Key": `record:${industryCode}:${suffix}` },
        body: JSON.stringify(body),
      });
      assert.equal(recordResult.response.status, 200, `${industryCode} form storage failed: ${JSON.stringify(recordResult.body)}`);
      const record = recordResult.body?.data;
      assert.equal(record?.industryCode, industryCode);
      assert.equal(record?.entityType, entity.type);
      assert.ok(record?.id);
      createdRecords.push({ industryCode, businessId: result.business.id, recordId: record.id, token: result.auth.token });

      const listed = await request(base, `/api/v1/industry/records?entityType=${encodeURIComponent(entity.type)}`, { headers: auth });
      assert.equal(listed.response.status, 200);
      assert.ok(listed.body?.data?.some(item => item.id === record.id), `${industryCode} stored form not listed`);

      const updatedStatus = entity.statuses[1] || entity.statuses[0];
      const updated = await request(base, `/api/v1/industry/records/${record.id}`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ revision: record.revision, status: updatedStatus, data: body.data }),
      });
      assert.equal(updated.response.status, 200, `${industryCode} form update failed: ${JSON.stringify(updated.body)}`);
      assert.equal(updated.body?.data?.status, updatedStatus);

      const dashboard = await request(base, routeByIndustry[industryCode].dashboard, { headers: auth });
      assert.equal(dashboard.response.status, 200, `${industryCode} dashboard failed: ${JSON.stringify(dashboard.body)}`);
      const reports = await request(base, routeByIndustry[industryCode].reports, { headers: auth });
      assert.equal(reports.response.status, 200, `${industryCode} reports failed: ${JSON.stringify(reports.body)}`);
    }

    const first = createdRecords[0];
    const second = createdRecords[1];
    const crossTenant = await request(base, `/api/v1/industry/records/${second.recordId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${first.token}` },
    });
    assert.equal(crossTenant.response.status, 404, "cross-tenant record access must be rejected");
  } finally {
    if (createdBusinessIds.length) await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
    await new Promise(resolve => server.close(resolve));
  }
});
