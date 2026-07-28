import test from "node:test";
import assert from "node:assert/strict";
import { installManufacturingPack } from "../dist/industry/manufacturing-pack.js";
import { getIndustryPack } from "../dist/industry/registry.js";

test("Manufacturing pack is operational and registration-enabled", () => {
  const installed = installManufacturingPack();
  const pack = getIndustryPack("manufacturing");
  assert.equal(pack, installed);
  assert.equal(pack?.registrationEnabled, true);
  assert.equal(pack?.operationalStatus, "vertical_beta");
  assert.ok(pack?.modules.includes("productionOrders"));
  assert.ok(pack?.modules.includes("quality"));
  assert.ok(pack?.entities.length >= 9);
});

test("Manufacturing entity definitions cover the end-to-end production lifecycle", () => {
  const pack = installManufacturingPack();
  const types = new Set(pack.entities.map(entity => entity.type));
  for (const expected of [
    "manufacturing_material",
    "manufacturing_bom",
    "manufacturing_production_order",
    "manufacturing_material_issue",
    "manufacturing_work_stage",
    "manufacturing_quality_checkpoint",
    "manufacturing_output_receipt",
    "manufacturing_scrap",
    "manufacturing_cost_entry",
  ]) assert.ok(types.has(expected), `Missing ${expected}`);

  const order = pack.entities.find(entity => entity.type === "manufacturing_production_order");
  assert.ok(order?.statuses.includes("released"));
  assert.ok(order?.statuses.includes("in_progress"));
  assert.ok(order?.fields.some(field => field.key === "bomReference" && field.required));
  assert.ok(order?.fields.some(field => field.key === "dueDate" && field.required));

  const quality = pack.entities.find(entity => entity.type === "manufacturing_quality_checkpoint");
  assert.ok(quality?.statuses.includes("failed"));
  assert.ok(quality?.fields.some(field => field.key === "specification" && field.required));
});
