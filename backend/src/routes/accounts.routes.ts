import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/accounts.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/transactions", requirePermission("accounts.view"), c.transactions);
router.post("/transactions", requirePermission("accounts.manage"), c.addTransaction);
router.post("/:id/reconcile", requirePermission("accounts.reconcile"), c.reconcile);
router.get("/", requirePermission("accounts.view"), c.list);
router.post("/", requirePermission("accounts.manage"), c.create);
router.get("/:id", requirePermission("accounts.view"), c.get);
router.patch("/:id", requirePermission("accounts.manage"), c.update);
router.delete("/:id", requirePermission("accounts.manage"), c.remove);

export { router };
export const accountsRoutes = router;
export default router;
