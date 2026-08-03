import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/reports.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/options", requirePermission("reports.view"), c.options);
router.get("/:reportId", requirePermission("reports.view"), c.run);

export { router };
export const reportsRoutes = router;
export default router;
