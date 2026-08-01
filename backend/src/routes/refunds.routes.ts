import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePersistentIdempotency } from "../middleware/idempotency.middleware.js";
import { createRefund, getRefundById, listRefunds } from "../controllers/refunds.controller.js";

export const router = Router();
router.use(requireAuth);
router.get("/", listRefunds);
router.get("/:id", getRefundById);
router.post("/", requirePersistentIdempotency("refund.create"), createRefund);
export const refundsRoutes = router;
export const refundsRouter = router;
export default router;
