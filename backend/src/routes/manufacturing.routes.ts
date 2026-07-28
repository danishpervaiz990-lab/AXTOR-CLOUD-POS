import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireIndustry } from "../middleware/industry-guard.middleware.js";
import { requireAnyPermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/manufacturing.controller.js";

const permission = (...names: string[]) => requireAnyPermission(...names);

export const manufacturingRouter = Router();
manufacturingRouter.use(requireAuth, requireIndustry("manufacturing", "factory"));

const bomWrite = permission("industry.manufacturing.bom.manage", "industry.manufacturing.engineering.manage");
const workOrderWrite = permission("industry.manufacturing.work_order.manage", "industry.manufacturing.production.manage");
const inventoryWrite = permission("industry.manufacturing.material.manage", "inventory.manage");
const qualityWrite = permission("industry.manufacturing.quality.manage", "industry.manufacturing.scrap.manage");
const capacityWrite = permission("industry.manufacturing.capacity.manage", "industry.manufacturing.planning.manage");
const settingsWrite = permission("industry.manufacturing.settings.manage", "settings.manage");

manufacturingRouter.get("/dashboard", c.manufacturingDashboard);
manufacturingRouter.get("/boms", c.manufacturingBoms);
manufacturingRouter.post("/boms", bomWrite, c.manufacturingBomCreate);
manufacturingRouter.get("/work-orders", c.manufacturingWorkOrders);
manufacturingRouter.post("/work-orders", workOrderWrite, c.manufacturingWorkOrderCreate);
manufacturingRouter.post("/work-orders/:id/material-issues", inventoryWrite, c.manufacturingMaterialIssue);
manufacturingRouter.post("/work-orders/:id/material-returns", inventoryWrite, c.manufacturingMaterialReturn);
manufacturingRouter.post("/work-orders/:id/stages", workOrderWrite, c.manufacturingStageCreate);
manufacturingRouter.post("/work-orders/:id/finished-goods", inventoryWrite, c.manufacturingFinishedGoods);
manufacturingRouter.post("/work-orders/:id/scrap", qualityWrite, c.manufacturingScrapCreate);
manufacturingRouter.get("/work-in-progress", c.manufacturingWip);
manufacturingRouter.get("/costs", c.manufacturingCosts);
manufacturingRouter.get("/capacity", c.manufacturingCapacity);
manufacturingRouter.post("/capacity", capacityWrite, c.manufacturingCapacityCreate);
manufacturingRouter.get("/reports", c.manufacturingReports);
manufacturingRouter.get("/settings", c.manufacturingSettings);
manufacturingRouter.put("/settings", settingsWrite, c.manufacturingSettingsUpdate);

export default manufacturingRouter;
