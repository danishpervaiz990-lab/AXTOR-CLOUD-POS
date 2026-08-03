import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import * as c from "../controllers/expenses.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/", requirePermission("expenses.view"), c.list);
router.post("/", requirePermission("expenses.manage"), c.create);
router.patch("/:id", requirePermission("expenses.manage"), c.update);
router.delete("/:id", requirePermission("expenses.manage"), c.remove);

export { router };
export const expensesRoutes = router;
export default router;
