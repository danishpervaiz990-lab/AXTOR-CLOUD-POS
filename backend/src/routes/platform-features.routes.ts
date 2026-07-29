import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import * as controller from "../controllers/platform-features.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/status", controller.capabilityStatus);
router.get("/audit-logs", controller.auditLogs);
router.post("/audit-logs", controller.createAuditLog);

export default router;
