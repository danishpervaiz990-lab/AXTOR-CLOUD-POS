import { INDUSTRY_REGISTRY, type IndustryEntityDefinition, type IndustryField, type IndustryPack } from "./registry.js";

const field = (key: string, label: string, type: IndustryField["type"] = "text", required = false, options?: string[]): IndustryField => ({ key, label, type, required, ...(options ? { options } : {}) });
const entity = (type: string, label: string, icon: string, statuses: string[], fields: IndustryField[], permission: string): IndustryEntityDefinition => ({ type, label, pluralLabel: label.endsWith("s") ? label : `${label}s`, icon, statuses, fields, permission: `industry.manufacturing.${permission}` });

export const MANUFACTURING_PACK: IndustryPack = {
  code: "manufacturing",
  name: "Light Manufacturing",
  description: "Revision-controlled BOMs, production orders, material issue and return, work stages, quality checkpoints, output receipt, capacity, costing, yield, scrap and variance.",
  icon: "bi-gear-wide-connected",
  suitableFor: ["Small factories", "Assemblers", "Paint and chemical production", "Furniture manufacturing", "Light production businesses"],
  catalogueHighlights: ["Revision-controlled BOM", "Tenant-scoped production orders", "Material and finished-goods stock posting", "Quality, yield and cost variance"],
  operationalStatus: "core_ready",
  registrationEnabled: true,
  modules: ["materials", "bom", "productionOrders", "workOrders", "materialIssue", "wip", "quality", "output", "scrap", "capacity", "costing", "reports"],
  sidebarOrder: ["dashboard", "materials", "bom", "workOrders", "materialIssue", "wip", "quality", "output", "scrap", "capacity", "costing", "reports", "settings"],
  dashboardWidgets: ["activeWorkOrders", "plannedQuantity", "completedQuantity", "scrapQuantity", "yieldPercent", "capacityHours", "costVariance"],
  defaultRoles: {
    "Manufacturing Manager": ["industry.manufacturing.*", "products.view", "inventory.*", "reports.*"],
    "Production Planner": ["industry.manufacturing.bom.*", "industry.manufacturing.work_order.*", "industry.manufacturing.capacity.*", "products.view", "inventory.view"],
    "Production Operator": ["industry.manufacturing.work_order.view", "industry.manufacturing.stage.*", "industry.manufacturing.material.view", "industry.manufacturing.quality.view"],
    "Storekeeper": ["industry.manufacturing.material.*", "industry.manufacturing.finished_goods.*", "inventory.*", "products.view"],
    "Quality Inspector": ["industry.manufacturing.work_order.view", "industry.manufacturing.quality.*", "industry.manufacturing.scrap.view"],
    "Manufacturing Read Only": ["industry.manufacturing.*.view", "products.view", "inventory.view", "reports.view"]
  },
  defaultSettings: {
    requireApprovedBom: true,
    requireQualityBeforeReceipt: false,
    issueMethod: "manual",
    allowNegativeMaterialStock: false,
    costMethod: "actual",
    defaultScrapDisposition: "quarantine"
  },
  notificationRules: [
    { code: "manufacturing-work-order-due", eventType: "manufacturing.work_order.due", daysBefore: [7, 3, 1] },
    { code: "manufacturing-material-shortage", eventType: "manufacturing.material.shortage" },
    { code: "manufacturing-quality-failed", eventType: "manufacturing.quality.failed" },
    { code: "manufacturing-capacity-overload", eventType: "manufacturing.capacity.overload" }
  ],
  printFields: ["workOrderNo", "product", "bomRevision", "plannedQty", "completedQty", "scrapQty", "stage", "operator", "qualityResult"],
  reports: ["productionStatus", "materialUsage", "workInProgress", "yieldAndScrap", "qualityResults", "capacityUtilization", "productionCost", "costVariance"],
  entities: [
    entity("manufacturing_bom", "Bill of Materials", "bi-diagram-3", ["draft", "active", "obsolete"], [
      field("productId", "Finished product ID", "text", true), field("name", "BOM name", "text", true), field("revision", "Revision", "number", true), field("outputQuantity", "Output quantity", "number", true), field("unit", "Output unit"), field("components", "Components JSON", "textarea", true), field("notes", "Engineering notes", "textarea")
    ], "bom"),
    entity("manufacturing_work_order", "Production Work Order", "bi-clipboard2-check", ["planned", "released", "in_progress", "blocked", "completed", "cancelled"], [
      field("productId", "Finished product ID", "text", true), field("bomId", "BOM ID"), field("plannedQty", "Planned quantity", "number", true), field("completedQty", "Completed quantity", "number"), field("scrapQty", "Scrap quantity", "number"), field("priority", "Priority", "select", false, ["low", "normal", "high", "urgent"]), field("warehouseId", "Warehouse ID"), field("assignedTeam", "Assigned team"), field("notes", "Production notes", "textarea")
    ], "work_order"),
    entity("manufacturing_material_issue", "Material Issue", "bi-box-arrow-right", ["posted", "reversed"], [field("workOrderId", "Work order ID", "text", true), field("items", "Issued items JSON", "textarea", true), field("postedAt", "Posted at", "datetime"), field("notes", "Notes", "textarea")], "material"),
    entity("manufacturing_material_return", "Material Return", "bi-box-arrow-in-left", ["posted", "reversed"], [field("workOrderId", "Work order ID", "text", true), field("items", "Returned items JSON", "textarea", true), field("postedAt", "Posted at", "datetime"), field("notes", "Notes", "textarea")], "material"),
    entity("manufacturing_wip_event", "Production Stage", "bi-list-check", ["planned", "in_progress", "completed", "blocked", "cancelled"], [field("workOrderId", "Work order ID", "text", true), field("stage", "Stage", "text", true), field("machine", "Machine / line"), field("operator", "Operator / team"), field("completedQty", "Completed quantity", "number"), field("actualHours", "Actual hours", "number"), field("notes", "Stage notes", "textarea")], "stage"),
    entity("manufacturing_quality_check", "Quality Check", "bi-shield-check", ["passed", "conditional", "failed", "rework"], [field("workOrderId", "Work order ID", "text", true), field("checkpoint", "Checkpoint", "text", true), field("inspector", "Inspector", "text", true), field("checkedQty", "Checked quantity", "number", true), field("acceptedQty", "Accepted quantity", "number", true), field("rejectedQty", "Rejected quantity", "number"), field("measurements", "Measurements JSON", "textarea"), field("notes", "Inspection notes", "textarea")], "quality"),
    entity("manufacturing_finished_goods_receipt", "Finished Goods Receipt", "bi-box-seam", ["posted", "reversed"], [field("workOrderId", "Work order ID", "text", true), field("productId", "Finished product ID", "text", true), field("quantity", "Quantity", "number", true), field("warehouseId", "Warehouse ID"), field("postedAt", "Posted at", "datetime"), field("notes", "Receipt notes", "textarea")], "finished_goods"),
    entity("manufacturing_scrap", "Production Scrap", "bi-recycle", ["recorded", "quarantined", "reworked", "disposed"], [field("workOrderId", "Work order ID", "text", true), field("quantity", "Scrap quantity", "number", true), field("reason", "Reason", "text", true), field("disposition", "Disposition", "select", false, ["discard", "rework", "recycle", "return_to_supplier", "quarantine"]), field("notes", "Notes", "textarea")], "scrap"),
    entity("manufacturing_capacity_plan", "Capacity Plan", "bi-calendar3", ["draft", "active", "closed"], [field("resource", "Resource / work centre", "text", true), field("period", "Period", "text", true), field("availableHours", "Available hours", "number", true), field("plannedHours", "Planned hours", "number"), field("machineCount", "Machine count", "number"), field("shiftCount", "Shift count", "number"), field("notes", "Planning notes", "textarea")], "capacity")
  ]
};

INDUSTRY_REGISTRY.manufacturing = MANUFACTURING_PACK;
