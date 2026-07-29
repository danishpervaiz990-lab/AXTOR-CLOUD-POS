import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import * as controller from "../controllers/platform-features.controller.js";
import * as config from "../controllers/platform-config.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/status", controller.capabilityStatus);
router.get("/summary", config.summary);
router.get("/audit-logs", controller.auditLogs);
router.post("/audit-logs", controller.createAuditLog);
router.get("/gift-cards", config.giftCards);
router.post("/gift-cards", config.issueGiftCard);
router.post("/gift-cards/:id/transactions", config.giftCardTransaction);
router.get("/api-keys", config.apiKeys);
router.post("/api-keys", config.createApiKey);
router.get("/backups", config.backups);
router.post("/backups", config.requestBackup);
router.get("/resources/:resource", config.list);
router.post("/resources/:resource", config.create);
router.patch("/resources/:resource/:id", config.update);
router.delete("/resources/:resource/:id", config.remove);

export default router;
