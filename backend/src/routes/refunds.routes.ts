import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePersistentIdempotency } from "../middleware/idempotency.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import { getRefundById, listRefunds } from "../controllers/refunds.controller.js";
import { createRefundByIndustry } from "../controllers/grocery-mutation-dispatch.controller.js";

export const router = Router();
router.use(requireAuth);
router.get("/", requirePermission("sales_documents.view"), listRefunds);
router.get("/:id", requirePermission("sales_documents.view"), getRefundById);
router.post("/", requirePermission("sales_documents.refund"), requirePersistentIdempotency("refund.create"), createRefundByIndustry);
export const refundsRoutes = router;
export const refundsRouter = router;
export default router;
