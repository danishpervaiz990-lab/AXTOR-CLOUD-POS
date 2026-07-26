import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import * as c from "../controllers/salesmen.controller.js";
const router=Router(); router.use(requireAuth);
router.get("/performance",c.performance); router.get("/payouts",c.payouts); router.patch("/payouts/:id",c.updatePayout); router.post("/targets/copy",c.copyTargets);
router.get("/",c.list); router.post("/",c.create); router.get("/:id",c.get); router.patch("/:id",c.update); router.delete("/:id",c.remove); router.put("/:id/target",c.target); router.post("/:id/target",c.target);
export {router}; export const salesmenRoutes=router; export default router;
