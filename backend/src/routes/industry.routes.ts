import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import * as controller from "../controllers/industry.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/registry", controller.registry);
router.get("/summary", controller.summary);
router.get("/records", controller.listRecords);
router.post("/records", controller.createRecord);
router.get("/records/:id", controller.getRecord);
router.patch("/records/:id", controller.updateRecord);
router.delete("/records/:id", controller.archiveRecord);
router.get("/batches", controller.listBatches);
router.post("/batches", controller.createBatch);
router.patch("/batches/:id", controller.updateBatch);
router.get("/print-profiles", controller.listPrintProfiles);
router.post("/print-profiles", controller.createPrintProfile);
router.patch("/print-profiles/:id", controller.updatePrintProfile);
router.get("/notification-rules", controller.listNotificationRules);
router.post("/notification-rules", controller.createNotificationRule);
router.patch("/notification-rules/:id", controller.updateNotificationRule);
router.post("/notification-rules/evaluate", controller.evaluateNotificationRules);

export default router;
