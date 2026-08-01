import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePersistentIdempotency } from "../middleware/idempotency.middleware.js";
import { createSalesReturn, getSalesReturnById, listSalesReturns } from "../controllers/sales-returns.controller.js";

export const router = Router();
router.use(requireAuth);
router.get("/", listSalesReturns);
router.get("/:id", getSalesReturnById);
router.post("/", requirePersistentIdempotency("sales_return.create"), createSalesReturn);

export const salesReturnsRoutes = router;
export const salesReturnsRouter = router;
export default router;
