import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/settings.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/export", requirePermission("settings.export"), c.exportAll);
router.post("/import", requirePermission("settings.manage"), c.importAll);
router.put("/bulk", requirePermission("settings.manage"), c.bulk);
router.get("/", requirePermission("settings.view"), c.list);
router.get("/:key", requirePermission("settings.view"), c.get);
router.put("/:key", requirePermission("settings.manage"), c.set);
router.patch("/:key", requirePermission("settings.manage"), c.set);
router.delete("/:key", requirePermission("settings.manage"), c.remove);

export { router };
export const settingsRoutes = router;
export default router;
