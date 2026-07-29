import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAnyPermission } from "../middleware/permission.middleware.js";
import { requirePlatformResourcePermission } from "../middleware/platform-access.middleware.js";
import * as controller from "../controllers/platform-features.controller.js";
import * as config from "../controllers/platform-config.controller.js";

const router = Router();
router.use(requireAuth);

router.get("/status", controller.capabilityStatus);
router.get("/summary", config.summary);

router.get(
  "/audit-logs",
  requireAnyPermission("audit_logs.view", "audit_logs.*", "reports.view", "reports.*", "settings.view"),
  controller.auditLogs,
);
// Authenticated application clients may append their own tenant-scoped audit events.
router.post("/audit-logs", controller.createAuditLog);

router.get(
  "/gift-cards",
  requireAnyPermission("loyalty.view", "loyalty.*", "platform.gift_cards.view", "platform.*"),
  config.giftCards,
);
router.post(
  "/gift-cards",
  requireAnyPermission("loyalty.manage", "loyalty.*", "platform.gift_cards.manage", "platform.*"),
  config.issueGiftCard,
);
router.post(
  "/gift-cards/:id/transactions",
  requireAnyPermission("loyalty.manage", "loyalty.*", "platform.gift_cards.manage", "platform.*"),
  config.giftCardTransaction,
);

router.get(
  "/api-keys",
  requireAnyPermission("platform.api_keys.view", "platform.api_keys.*", "settings.view", "platform.*"),
  config.apiKeys,
);
router.post(
  "/api-keys",
  requireAnyPermission("platform.api_keys.manage", "platform.api_keys.*", "settings.manage", "platform.*"),
  config.createApiKey,
);
router.post(
  "/api-keys/:id/revoke",
  requireAnyPermission("platform.api_keys.manage", "platform.api_keys.*", "settings.manage", "platform.*"),
  config.revokeApiKey,
);

router.get(
  "/backups",
  requireAnyPermission("platform.backups.view", "platform.backups.*", "settings.view", "platform.*"),
  config.backups,
);
router.post(
  "/backups",
  requireAnyPermission("platform.backups.manage", "platform.backups.*", "settings.manage", "platform.*"),
  config.requestBackup,
);

router.get("/resources/:resource", requirePlatformResourcePermission("view"), config.list);
router.post("/resources/:resource", requirePlatformResourcePermission("manage"), config.create);
router.patch("/resources/:resource/:id", requirePlatformResourcePermission("manage"), config.update);
router.delete("/resources/:resource/:id", requirePlatformResourcePermission("manage"), config.remove);

export default router;
