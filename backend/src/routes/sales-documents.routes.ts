import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  createSalesDocument,
  getSalesDocumentById,
  listSalesDocuments,
} from "../controllers/sales-documents.controller.js";

export const router = Router();

router.use(requireAuth);

router.get("/", listSalesDocuments);
router.get("/:id", getSalesDocumentById);
router.post("/", createSalesDocument);

export const salesDocumentsRoutes = router;
export const salesDocumentsRouter = router;

export default router;
