import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePersistentIdempotency } from "../middleware/idempotency.middleware.js";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware.js";
import { validateGrocerySale } from "../middleware/grocery-sale-validation.middleware.js";
import {
  createSalesDocument,
  getSalesDocumentById,
  getSalesDocumentContext,
  listSalesDocuments,
  postSalesDocument,
  previewSalesDocumentNumber,
  updateSalesDocument,
} from "../controllers/sales-documents.controller.js";

export const router = Router();
router.use(requireAuth);
router.get("/context", requireAnyPermission("sales_documents.view", "sales_documents.create"), getSalesDocumentContext);
router.get("/number-preview", requirePermission("sales_documents.create"), previewSalesDocumentNumber);
router.get("/", requirePermission("sales_documents.view"), listSalesDocuments);
router.get("/:id", requirePermission("sales_documents.view"), getSalesDocumentById);
router.post("/", requirePermission("sales_documents.create"), requirePersistentIdempotency("sales_document.create"), validateGrocerySale, createSalesDocument);
router.post("/:id/post", requirePermission("sales_documents.post"), requirePersistentIdempotency("sales_document.post"), postSalesDocument);
router.patch(
  "/:id",
  requireAnyPermission(
    "sales_documents.edit_draft",
    "sales_documents.edit_posted",
    "sales_documents.edit_paid",
    "sales_documents.edit_returned",
    "sales_documents.edit_refunded",
  ),
  validateGrocerySale,
  updateSalesDocument,
);

export const salesDocumentsRoutes = router;
export const salesDocumentsRouter = router;
export default router;
