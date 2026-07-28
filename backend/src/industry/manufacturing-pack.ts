import { INDUSTRY_REGISTRY, type IndustryEntityDefinition, type IndustryField, type IndustryPack } from "./registry.js";

const field = (key: string, label: string, type: IndustryField["type"] = "text", required = false, options?: string[]): IndustryField => ({ key, label, type, required, ...(options ? { options } : {}) });
const entity = (type: string, label: string, icon: string, statuses: string[], fields: IndustryField[], permission: string): IndustryEntityDefinition => ({ type, label, pluralLabel: label.endsWith("s") ? label : `${label}s`, icon, statuses, fields, permission: `industry.manufacturing.${permission}` });

const manufacturingPack: IndustryPack = {
  code: "manufacturing",
  name: "Light Manufacturing",
  description: "Revision-controlled BOMs, production planning, material issue, work stages, quality, output receipt, scrap, yield and production costing.",
  icon: "bi-gear-wide-connected",
  suitableFor: ["Small factories", "Assemblers", "Light production businesses"],
  catalogueHighlights: ["Revision-controlled BOM", "Material reservation and issue", "Quality and output receipt", "Production cost variance"],
  operationalStatus: "vertical_beta",
  registrationEnabled: true,
  modules: ["materials", "bom", "productionOrders", "materialIssues", "workStages", "quality", "output", "scrap", "costing", "reports"],
  sidebarOrder: ["dashboard", "materials", "bom", "productionOrders", "materialIssues", "workStages", "quality", "output", "scrap", "costing", "reports"],
  dashboardWidgets: ["releasedOrders", "workInProgress", "qualityFailures", "outputToday", "scrapValue", "costVariance"],
  defaultRoles: {
    "Manufacturing Manager": ["industry.manufacturing.*", "products.*", "inventory.*", "purchases.*", "reports.*"],
    "Production Planner": ["industry.manufacturing.bom.*", "industry.manufacturing.production_order.*", "industry.manufacturing.work_stage.*"],
    "Stores Controller": ["industry.manufacturing.material.*", "industry.manufacturing.material_issue.*", "industry.manufacturing.output_receipt.*", "inventory.*"],
    "Quality Inspector": ["industry.manufacturing.quality_checkpoint.*", "industry.manufacturing.output_receipt.view"],
  },
  defaultSettings: { requireReleasedBom: true, blockNegativeMaterialIssue: true, requireQualityBeforeOutput: true, allowPartialOutput: true, costingMethod: "standard_plus_variance" },
  notificationRules: [
    { code: "manufacturing-order-due", eventType: "manufacturing.production_order.due", daysBefore: [7, 3, 1] },
    { code: "manufacturing-quality-failure", eventType: "manufacturing.quality.failed" },
    { code: "manufacturing-material-shortage", eventType: "manufacturing.material.shortage" },
  ],
  printFields: ["orderNo", "productReference", "bomReference", "plannedQuantity", "completedQuantity", "status"],
  reports: ["productionPlan", "workInProgress", "materialVariance", "yieldAndScrap", "qualityFailures", "productionCost", "workCenterUtilization"],
  entities: [
    entity("manufacturing_material", "Raw Material", "bi-box-seam", ["active", "inactive", "blocked"], [
      field("materialCode", "Material code", "text", true), field("materialName", "Material name", "text", true), field("productReference", "Product / SKU reference"),
      field("baseUnit", "Base unit", "text", true), field("warehouse", "Default warehouse"), field("reorderLevel", "Reorder level", "number"),
      field("standardCost", "Standard cost", "number"), field("leadTimeDays", "Lead time days", "number"), field("notes", "Notes", "textarea"),
    ], "material"),
    entity("manufacturing_bom", "Bill of Materials", "bi-diagram-3", ["draft", "released", "superseded", "archived"], [
      field("bomCode", "BOM code", "text", true), field("productReference", "Finished product reference", "text", true), field("revision", "Revision", "text", true),
      field("outputQuantity", "Output quantity", "number", true), field("outputUnit", "Output unit", "text", true), field("components", "Components (JSON or structured text)", "textarea", true),
      field("effectiveFrom", "Effective from", "date"), field("approvedBy", "Approved by"), field("notes", "Engineering notes", "textarea"),
    ], "bom"),
    entity("manufacturing_production_order", "Production Order", "bi-clipboard2-check", ["planned", "released", "in_progress", "on_hold", "completed", "cancelled"], [
      field("orderNo", "Production order number", "text", true), field("productReference", "Finished product reference", "text", true), field("bomReference", "Released BOM reference", "text", true),
      field("plannedQuantity", "Planned quantity", "number", true), field("completedQuantity", "Completed quantity", "number"), field("outputUnit", "Output unit", "text", true),
      field("warehouse", "Output warehouse", "text", true), field("priority", "Priority", "select", true, ["low", "normal", "high", "urgent"]),
      field("startDate", "Planned start", "date", true), field("dueDate", "Due date", "date", true), field("planner", "Planner"), field("notes", "Production notes", "textarea"),
    ], "production_order"),
    entity("manufacturing_material_issue", "Material Issue", "bi-box-arrow-right", ["draft", "posted", "reversed"], [
      field("productionOrderReference", "Production order reference", "text", true), field("warehouse", "Source warehouse", "text", true), field("issuedAt", "Issued at", "datetime", true),
      field("items", "Issued materials (JSON or structured text)", "textarea", true), field("issuedBy", "Issued by", "text", true), field("postingReference", "Inventory posting reference"), field("notes", "Issue notes", "textarea"),
    ], "material_issue"),
    entity("manufacturing_work_stage", "Work Stage", "bi-kanban", ["pending", "ready", "in_progress", "completed", "blocked", "cancelled"], [
      field("productionOrderReference", "Production order reference", "text", true), field("stageName", "Stage name", "text", true), field("sequence", "Sequence", "number", true),
      field("workCenter", "Work centre", "text", true), field("assignedTo", "Assigned operator / team"), field("startAt", "Start", "datetime"), field("endAt", "End", "datetime"),
      field("plannedMinutes", "Planned minutes", "number"), field("actualMinutes", "Actual minutes", "number"), field("notes", "Stage notes", "textarea"),
    ], "work_stage"),
    entity("manufacturing_quality_checkpoint", "Quality Checkpoint", "bi-shield-check", ["pending", "passed", "failed", "rework", "waived"], [
      field("productionOrderReference", "Production order reference", "text", true), field("stageReference", "Work stage reference"), field("checkName", "Checkpoint", "text", true),
      field("specification", "Specification", "textarea", true), field("measuredValue", "Measured value", "textarea"), field("result", "Result", "select", true, ["pending", "passed", "failed", "rework", "waived"]),
      field("checkedAt", "Checked at", "datetime", true), field("checkedBy", "Checked by", "text", true), field("notes", "Quality notes", "textarea"),
    ], "quality_checkpoint"),
    entity("manufacturing_output_receipt", "Finished Output Receipt", "bi-box-arrow-in-down", ["draft", "posted", "reversed"], [
      field("productionOrderReference", "Production order reference", "text", true), field("productReference", "Finished product reference", "text", true), field("quantity", "Received quantity", "number", true),
      field("unit", "Unit", "text", true), field("warehouse", "Destination warehouse", "text", true), field("batchNo", "Batch / lot number"), field("receivedAt", "Received at", "datetime", true),
      field("unitCost", "Actual unit cost", "number"), field("qualityReference", "Passed quality reference"), field("notes", "Receipt notes", "textarea"),
    ], "output_receipt"),
    entity("manufacturing_scrap", "Scrap / Yield Record", "bi-recycle", ["recorded", "reviewed", "approved", "reversed"], [
      field("productionOrderReference", "Production order reference", "text", true), field("materialReference", "Material / output reference", "text", true),
      field("recordType", "Record type", "select", true, ["scrap", "rework", "by_product", "yield_adjustment"]), field("quantity", "Quantity", "number", true),
      field("unit", "Unit", "text", true), field("reason", "Reason", "textarea", true), field("recordedAt", "Recorded at", "datetime", true), field("recordedBy", "Recorded by", "text", true), field("estimatedValue", "Estimated value", "number"),
    ], "scrap"),
    entity("manufacturing_cost_entry", "Production Cost Entry", "bi-calculator", ["draft", "posted", "adjusted"], [
      field("productionOrderReference", "Production order reference", "text", true), field("costType", "Cost type", "select", true, ["material", "labour", "machine", "overhead", "subcontract", "adjustment"]),
      field("description", "Description", "text", true), field("quantity", "Quantity", "number"), field("rate", "Rate", "number"), field("amount", "Amount", "number", true),
      field("recordedAt", "Recorded at", "datetime", true), field("reference", "Source reference"), field("notes", "Cost notes", "textarea"),
    ], "cost_entry"),
  ],
};

export function installManufacturingPack(): IndustryPack {
  INDUSTRY_REGISTRY.manufacturing = manufacturingPack;
  return manufacturingPack;
}

export { manufacturingPack };
