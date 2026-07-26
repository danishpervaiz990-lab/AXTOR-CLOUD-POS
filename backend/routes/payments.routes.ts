import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createPayment,
  getPaymentById,
  listPayments,
} from "../controllers/payments.controller.js";

export const router = Router();

router.use(requireAuth);

router.get("/", listPayments);
router.get("/:id", getPaymentById);
router.post("/", createPayment);

export const paymentsRoutes = router;
export const paymentsRouter = router;

export default router;
