import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createUser, updateUserRoles } from "../controllers/access-control.controller.js";
import { getAccessControlV2, updateRolePermissionsV2 } from "../controllers/access-control-v2.controller.js";
import { ensureTenantSystemRoles } from "../services/system-roles.service.js";

export const router = Router();
router.use(requireAuth);
router.use(ensureTenantSystemRoles);
router.get("/", getAccessControlV2);
router.post("/users", createUser);
router.patch("/roles/:roleId/permissions", updateRolePermissionsV2);
router.patch("/users/:userId/roles", updateUserRoles);

export const accessControlRoutes = router;
export const accessControlRouter = router;
export default router;
