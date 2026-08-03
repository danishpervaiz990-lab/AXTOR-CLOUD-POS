import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePersistentIdempotency } from "../middleware/idempotency.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import { createPayment, getPaymentById, listPayments } from "../controllers/payments.controller.js";

export const router = Router();
router.use(requireAuth);
router.get("/", requirePermission("payments.view"), listPayments);
router.get("/:id", requirePermission("payments.view"), getPaymentById);
router.post("/", requirePermission("payments.create"), requirePersistentIdempotency("payment.create"), createPayment);

export const paymentsRoutes = router;
export const paymentsRouter = router;
export default router;
