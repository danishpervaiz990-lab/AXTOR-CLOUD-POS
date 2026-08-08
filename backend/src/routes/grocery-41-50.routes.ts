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
import {
  groceryCreditOverrideApprove,
  groceryCreditOverrideReject,
  groceryCreditOverrideRequest,
  groceryEnhancementCatalog,
  groceryEntityCodeBind,
  groceryGlobalPreferencesSave,
  groceryHeldSaleApprove,
  groceryHeldSaleReject,
  groceryNumberAllocate,
  groceryNumberPreview,
  groceryNumberSettingsSave,
  grocerySalesApprovalQueue,
} from "../controllers/grocery-enhancement.controller.js";
import {
  grocerySalesAdminConvert,
  grocerySalesAdminDocumentDetail,
  grocerySalesAdminDocuments,
} from "../controllers/grocery-sales-admin.controller.js";

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

// Current Grocery production enhancement block. These endpoints reuse the
// existing AppSetting, IndustryRecord, ApprovalRequest and AuditLog models.
router.get("/enhancement/catalog", requireAnyPermission("settings.view", "products.manage", "customers.manage", "suppliers.manage", "sales_documents.view"), groceryEnhancementCatalog);
router.put("/enhancement/preferences", requirePermission("settings.manage"), groceryGlobalPreferencesSave);
router.get("/enhancement/numbering/:key/preview", requireAnyPermission("settings.view", "products.manage", "customers.manage", "suppliers.manage", "sales_documents.create", "purchases.create"), groceryNumberPreview);
router.post("/enhancement/numbering/:key/allocate", requireAnyPermission("products.manage", "customers.manage", "suppliers.manage", "sales_documents.create", "purchases.create", "purchases.receive", "payments.create", "inventory.transfer"), groceryNumberAllocate);
router.put("/enhancement/numbering/:key", requirePermission("settings.manage"), groceryNumberSettingsSave);
router.post("/enhancement/entity-codes/:key/:id", requireAnyPermission("products.manage", "customers.manage", "suppliers.manage", "settings.manage_permissions"), groceryEntityCodeBind);

router.get("/sales-admin/documents", requirePermission("sales_documents.view"), grocerySalesAdminDocuments);
router.get("/sales-admin/documents/:id", requirePermission("sales_documents.view"), grocerySalesAdminDocumentDetail);
router.post("/sales-admin/documents/:id/convert", requirePermission("sales_documents.create"), grocerySalesAdminConvert);
router.get("/sales-admin/approvals", requirePermission("sales_documents.view"), grocerySalesApprovalQueue);
router.post("/sales-admin/credit-overrides", requirePermission("sales_documents.create"), groceryCreditOverrideRequest);
router.post("/sales-admin/credit-overrides/:id/approve", requirePermission("sales_documents.view"), groceryCreditOverrideApprove);
router.post("/sales-admin/credit-overrides/:id/reject", requirePermission("sales_documents.view"), groceryCreditOverrideReject);
router.post("/sales-admin/held/:id/approve", requirePermission("sales_documents.view"), groceryHeldSaleApprove);
router.post("/sales-admin/held/:id/reject", requirePermission("sales_documents.view"), groceryHeldSaleReject);

export default router;
