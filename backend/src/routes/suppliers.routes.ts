import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/suppliers.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/", requirePermission("suppliers.view"), c.list);
router.post("/", requirePermission("suppliers.manage"), c.create);
router.get("/:id", requirePermission("suppliers.view"), c.get);
router.patch("/:id", requirePermission("suppliers.manage"), c.update);
router.delete("/:id", requirePermission("suppliers.manage"), c.remove);

export { router };
export const suppliersRoutes = router;
export default router;
