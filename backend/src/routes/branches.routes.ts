import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/branches.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/counters", requirePermission("branches.view"), c.counters);
router.post("/counters", requirePermission("branches.manage"), c.createCounter);
router.patch("/counters/:id", requirePermission("branches.manage"), c.updateCounter);
router.delete("/counters/:id", requirePermission("branches.manage"), c.deleteCounter);
router.get("/", requirePermission("branches.view"), c.list);
router.post("/", requirePermission("branches.manage"), c.create);
router.patch("/:id", requirePermission("branches.manage"), c.update);
router.delete("/:id", requirePermission("branches.manage"), c.remove);

export { router };
export const branchesRoutes = router;
export default router;
