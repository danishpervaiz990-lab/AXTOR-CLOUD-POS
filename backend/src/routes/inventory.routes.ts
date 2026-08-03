import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePersistentIdempotency } from "../middleware/idempotency.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/inventory.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/warehouses", requirePermission("inventory.view"), c.warehouses);
router.post("/warehouses", requirePermission("inventory.warehouses.manage"), requirePersistentIdempotency("inventory.warehouse.create"), c.createWarehouse);
router.patch("/warehouses/:id", requirePermission("inventory.warehouses.manage"), requirePersistentIdempotency("inventory.warehouse.update"), c.updateWarehouse);
router.delete("/warehouses/:id", requirePermission("inventory.warehouses.manage"), requirePersistentIdempotency("inventory.warehouse.delete"), c.deleteWarehouse);
router.get("/stock", requirePermission("inventory.view"), c.stock);
router.get("/movements", requirePermission("inventory.view"), c.movements);
router.post("/adjustments", requirePermission("inventory.adjust"), requirePersistentIdempotency("inventory.adjustment.create"), c.adjustment);
router.post("/transfers", requirePermission("inventory.transfer"), requirePersistentIdempotency("inventory.transfer.create"), c.transfer);
router.get("/valuation", requirePermission("inventory.view"), c.valuation);
router.get("/low-stock", requirePermission("inventory.view"), c.lowStock);
router.get("/stock-counts", requirePermission("inventory.view"), c.counts);
router.get("/stock-counts/sheet/:warehouseId", requirePermission("inventory.view"), c.countSheet);
router.post("/stock-counts/approve", requirePermission("inventory.count"), requirePersistentIdempotency("inventory.stock-count.approve"), c.approveCount);

export { router };
export const inventoryRoutes = router;
export default router;
