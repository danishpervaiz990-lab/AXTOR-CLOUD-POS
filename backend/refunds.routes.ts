import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createUser, getAccessControl, updateRolePermissions, updateUserRoles } from "../controllers/access-control.controller.js";

export const router = Router();
router.use(requireAuth);
router.get("/", getAccessControl);
router.post("/users", createUser);
router.patch("/roles/:roleId/permissions", updateRolePermissions);
router.patch("/users/:userId/roles", updateUserRoles);

export const accessControlRoutes = router;
export const accessControlRouter = router;
export default router;
