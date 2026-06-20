import { Router, RequestHandler } from "express";
import * as tenantMiddlewareModule from "../middleware/tenant.middleware.js";
import {
  createSalesDocument,
  getSalesDocumentById,
  listSalesDocuments,
} from "../controllers/sales-documents.controller.js";

export const router = Router();

const requireTenantAuth =
  (tenantMiddlewareModule as any).requireAuth ||
  (tenantMiddlewareModule as any).tenantMiddleware ||
  (tenantMiddlewareModule as any).requireTenant ||
  (tenantMiddlewareModule as any).authMiddleware ||
  (tenantMiddlewareModule as any).default;

if (requireTenantAuth) {
  router.use(requireTenantAuth as RequestHandler);
}

router.get("/", listSalesDocuments);
router.get("/:id", getSalesDocumentById);
router.post("/", createSalesDocument);

export const salesDocumentsRoutes = router;
export const salesDocumentsRouter = router;

export default router;
