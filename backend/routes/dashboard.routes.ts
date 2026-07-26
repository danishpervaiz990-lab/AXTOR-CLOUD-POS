import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { dashboardSummary } from "../controllers/dashboard.controller.js";
const router = Router();
router.use(requireAuth);
router.get("/summary", dashboardSummary);
export { router };
export const dashboardRoutes = router;
export default router;
