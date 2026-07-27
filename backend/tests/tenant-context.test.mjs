import assert from "node:assert/strict";
import test from "node:test";
import { serializeBusinessContext } from "../dist/services/tenant-context.service.js";

const business = {
  id: "business-1",
  name: "Doha Strength Club",
  slug: "doha-strength",
  status: "ACTIVE",
  timezone: "Asia/Qatar",
  currency: "QAR",
  businessIndustry: {
    provisioningState: "completed",
    industry: { code: "GYM", name: "Gym / Fitness" },
  },
};

test("canonical business context includes normalized industry identity", () => {
  assert.deepEqual(serializeBusinessContext(business), {
    id: "business-1",
    name: "Doha Strength Club",
    slug: "doha-strength",
    status: "ACTIVE",
    timezone: "Asia/Qatar",
    currency: "QAR",
    industryCode: "gym",
    industry: { code: "gym", name: "Gym / Fitness" },
    setupRequired: false,
    provisioningState: "completed",
  });
});

test("missing industry is explicit setup-required state", () => {
  const result = serializeBusinessContext({ ...business, businessIndustry: null });
  assert.equal(result.industryCode, null);
  assert.equal(result.industry, null);
  assert.equal(result.setupRequired, true);
});

test("legacy combined code resolves to one canonical hardware workspace", () => {
  const result = serializeBusinessContext({
    ...business,
    businessIndustry: {
      provisioningState: "completed",
      industry: { code: "hardware_paint", name: "Hardware and Paint" },
    },
  });
  assert.equal(result.industryCode, "hardware");
  assert.equal(result.industry.code, "hardware");
});
