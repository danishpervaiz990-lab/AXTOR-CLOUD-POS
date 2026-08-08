import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireIndustry } from "../middleware/industry-guard.middleware.js";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware.js";
import { groceryHeavyOperationRateLimit } from "../middleware/security.middleware.js";
import {
  grocery41To50Catalog, groceryCostHistory, groceryDashboardV5, groceryExportDataset, groceryGlobalSearch,
  groceryImportCommit, groceryImportPreview, groceryLabelPreview, groceryNotificationRuleSave, groceryNotificationRules,
  groceryNotificationsGenerate, groceryPrintableDocument, groceryPrintProfileSave, groceryPrintProfiles, grocerySettingsSaveV5,
  grocerySettingsV5, groceryStockValuation, grocerySyncValuation,
} from "../controllers/grocery-41-50.controller.js";
import { groceryProductLookupV5 } from "../controllers/grocery-product-lookup-v5.controller.js";

const router = Router();
router.use(requireAuth, requireIndustry("grocery"));

router.get("/products/lookup", requireAnyPermission("products.view", "inventory.view", "sales_documents.create"), groceryProductLookupV5);
router.get("/requirements-41-50/catalog", requireAnyPermission("dashboard.view", "reports.view", "settings.view"), grocery41To50Catalog);
router.get("/valuation", requireAnyPermission("inventory.view", "reports.view", "reports.profit"), groceryStockValuation);
router.post("/valuation/sync-weighted-average", groceryHeavyOperationRateLimit, requireAnyPermission("inventory.adjust", "accounts.manage"), grocerySyncValuation);
router.get("/products/:productId/cost-history", requireAnyPermission("products.view_cost", "purchases.view", "reports.view"), groceryCostHistory);

router.get("/print/profiles", requireAnyPermission("reports.print", "settings.view"), groceryPrintProfiles);
router.put("/print/profiles/:code", requirePermission("settings.manage"), groceryPrintProfileSave);
router.get("/print/document/:type/:id", requirePermission("reports.print"), groceryPrintableDocument);
router.post("/labels/preview", requireAnyPermission("products.view", "reports.print"), groceryLabelPreview);

router.get("/dashboard-v5", requirePermission("dashboard.view"), groceryDashboardV5);
router.get("/settings-v5", requirePermission("settings.view"), grocerySettingsV5);
router.put("/settings-v5", requirePermission("settings.manage"), grocerySettingsSaveV5);
router.get("/notification-rules", requirePermission("settings.view"), groceryNotificationRules);
router.put("/notification-rules/:code", requirePermission("settings.manage"), groceryNotificationRuleSave);
router.post("/notifications/generate", groceryHeavyOperationRateLimit, requireAnyPermission("settings.manage", "reports.view"), groceryNotificationsGenerate);

router.post("/imports/preview", groceryHeavyOperationRateLimit, requirePermission("settings.manage"), groceryImportPreview);
router.post("/imports/commit", groceryHeavyOperationRateLimit, requirePermission("settings.manage"), groceryImportCommit);
router.get("/exports/:entityType", requireAnyPermission("settings.export", "reports.export"), groceryExportDataset);
router.get("/search", requireAnyPermission("dashboard.view", "products.view", "sales_documents.view", "purchases.view"), groceryGlobalSearch);

export default router;
