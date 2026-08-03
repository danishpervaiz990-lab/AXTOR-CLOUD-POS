import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/salesmen.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/performance", requirePermission("salespeople.view"), c.performance);
router.get("/payouts", requirePermission("salespeople.view"), c.payouts);
router.patch("/payouts/:id", requirePermission("salespeople.payouts"), c.updatePayout);
router.post("/targets/copy", requirePermission("salespeople.manage"), c.copyTargets);
router.get("/", requirePermission("salespeople.view"), c.list);
router.post("/", requirePermission("salespeople.manage"), c.create);
router.get("/:id", requirePermission("salespeople.view"), c.get);
router.patch("/:id", requirePermission("salespeople.manage"), c.update);
router.delete("/:id", requirePermission("salespeople.manage"), c.remove);
router.put("/:id/target", requirePermission("salespeople.manage"), c.target);
router.post("/:id/target", requirePermission("salespeople.manage"), c.target);

export { router };
export const salesmenRoutes = router;
export default router;
