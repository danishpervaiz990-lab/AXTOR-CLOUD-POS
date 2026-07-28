import "../industry/manufacturing-release.js";
import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireIndustry } from "../middleware/industry-guard.middleware.js";
import { requireAnyPermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/manufacturing.controller.js";
import * as e from "../controllers/manufacturing-release-e.controller.js";

const permission = (...names: string[]) => requireAnyPermission(...names);

export const manufacturingRouter = Router();
manufacturingRouter.use(requireAuth, requireIndustry("manufacturing", "factory"));

const dashboardRead = permission("industry.manufacturing.work_order.view", "industry.manufacturing.material.view", "industry.manufacturing.quality.view", "reports.view");
const bomRead = permission("industry.manufacturing.bom.view", "industry.manufacturing.engineering.view");
const bomWrite = permission("industry.manufacturing.bom.manage", "industry.manufacturing.bom.create", "industry.manufacturing.engineering.manage");
const workOrderRead = permission("industry.manufacturing.work_order.view", "industry.manufacturing.production.view");
const workOrderWrite = permission("industry.manufacturing.work_order.manage", "industry.manufacturing.work_order.create", "industry.manufacturing.production.manage");
const inventoryRead = permission("industry.manufacturing.material.view", "industry.manufacturing.finished_goods.view", "inventory.view");
const inventoryWrite = permission("industry.manufacturing.material.manage", "industry.manufacturing.material.create", "industry.manufacturing.finished_goods.manage", "inventory.manage");
const qualityRead = permission("industry.manufacturing.quality.view", "industry.manufacturing.scrap.view");
const qualityWrite = permission("industry.manufacturing.quality.manage", "industry.manufacturing.quality.create", "industry.manufacturing.scrap.manage");
const capacityRead = permission("industry.manufacturing.capacity.view", "industry.manufacturing.planning.view");
const capacityWrite = permission("industry.manufacturing.capacity.manage", "industry.manufacturing.capacity.create", "industry.manufacturing.planning.manage");
const reportRead = permission("reports.view", "industry.manufacturing.work_order.view", "industry.manufacturing.cost.view");
const settingsRead = permission("industry.manufacturing.settings.view", "settings.view");
const settingsWrite = permission("industry.manufacturing.settings.manage", "settings.manage");

manufacturingRouter.get("/dashboard", dashboardRead, c.manufacturingDashboard);
manufacturingRouter.get("/boms", bomRead, c.manufacturingBoms);
manufacturingRouter.post("/boms", bomWrite, c.manufacturingBomCreate);
manufacturingRouter.get("/work-orders", workOrderRead, c.manufacturingWorkOrders);
manufacturingRouter.get("/work-orders/:id", workOrderRead, e.manufacturingWorkOrderDetail);
manufacturingRouter.post("/work-orders", workOrderWrite, c.manufacturingWorkOrderCreate);
manufacturingRouter.patch("/work-orders/:id", workOrderWrite, e.manufacturingWorkOrderUpdate);
manufacturingRouter.post("/work-orders/:id/material-issues", inventoryWrite, c.manufacturingMaterialIssue);
manufacturingRouter.post("/work-orders/:id/material-returns", inventoryWrite, c.manufacturingMaterialReturn);
manufacturingRouter.post("/work-orders/:id/stages", workOrderWrite, c.manufacturingStageCreate);
manufacturingRouter.post("/work-orders/:id/finished-goods", inventoryWrite, c.manufacturingFinishedGoods);
manufacturingRouter.post("/work-orders/:id/scrap", qualityWrite, c.manufacturingScrapCreate);
manufacturingRouter.get("/work-in-progress", workOrderRead, c.manufacturingWip);
manufacturingRouter.get("/quality-checks", qualityRead, e.manufacturingQualityChecks);
manufacturingRouter.post("/quality-checks", qualityWrite, e.manufacturingQualityCheckCreate);
manufacturingRouter.get("/costs", reportRead, e.manufacturingCostsEnhanced);
manufacturingRouter.get("/capacity", capacityRead, c.manufacturingCapacity);
manufacturingRouter.post("/capacity", capacityWrite, c.manufacturingCapacityCreate);
manufacturingRouter.get("/reports", reportRead, c.manufacturingReports);
manufacturingRouter.get("/settings", settingsRead, c.manufacturingSettings);
manufacturingRouter.put("/settings", settingsWrite, c.manufacturingSettingsUpdate);

export default manufacturingRouter;
