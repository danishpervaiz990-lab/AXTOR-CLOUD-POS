import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/shifts.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/current", requirePermission("shifts.view"), c.current);
router.post("/open", requirePermission("shifts.open"), c.open);
router.get("/:id/summary", requirePermission("shifts.view"), c.summary);
router.post("/:id/close", requirePermission("shifts.close"), c.close);
router.get("/", requirePermission("shifts.view"), c.list);

export { router };
export const shiftsRoutes = router;
export default router;
