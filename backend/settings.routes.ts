import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePlatformAdmin } from "../middleware/platform-admin.middleware.js";
import * as controller from "../controllers/platform-admin.controller.js";

const router = Router();
router.use(requireAuth, requirePlatformAdmin);
router.get("/tenants", controller.listTenants);
router.post("/tenants", controller.createTenant);
router.patch("/tenants/:businessId", controller.updateTenant);
router.post("/tenants/:businessId/subscription", controller.changeSubscription);
router.put("/tenants/:businessId/feature-override", controller.saveOverride);
router.post("/tenants/:businessId/reset-onboarding", controller.resetOnboarding);
router.post("/tenants/:businessId/revoke-sessions", controller.revokeSessions);

export default router;
