import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
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
router.get("/context", getSalesDocumentContext);
router.get("/number-preview", previewSalesDocumentNumber);
router.get("/", listSalesDocuments);
router.get("/:id", getSalesDocumentById);
router.post("/", createSalesDocument);
router.post("/:id/post", postSalesDocument);
router.patch("/:id", updateSalesDocument);

export const salesDocumentsRoutes = router;
export const salesDocumentsRouter = router;
export default router;
