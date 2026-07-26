import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import * as controller from "../controllers/commercial.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/catalog", controller.catalog);
router.get("/context", controller.context);
router.put("/onboarding", controller.saveOnboarding);
router.post("/onboarding/complete", controller.completeOnboarding);
router.post("/exchange-rates", controller.saveExchangeRate);
router.put("/preferences", controller.savePreferences);
router.put("/currencies", controller.setBusinessCurrencies);
router.get("/tax-rates", controller.listTaxRates);
router.post("/tax-rates", controller.createTaxRate);
router.patch("/tax-rates/:id", controller.updateTaxRate);
router.get("/export/config", controller.exportTenantConfig);

export default router;
