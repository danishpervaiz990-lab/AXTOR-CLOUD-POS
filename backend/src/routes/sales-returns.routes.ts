import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePersistentIdempotency } from "../middleware/idempotency.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import { createSalesReturn, getSalesReturnById, listSalesReturns } from "../controllers/sales-returns.controller.js";

export const router = Router();
router.use(requireAuth);
router.get("/", requirePermission("sales_documents.view"), listSalesReturns);
router.get("/:id", requirePermission("sales_documents.view"), getSalesReturnById);
router.post("/", requirePermission("sales_documents.return"), requirePersistentIdempotency("sales_return.create"), createSalesReturn);

export const salesReturnsRoutes = router;
export const salesReturnsRouter = router;
export default router;
