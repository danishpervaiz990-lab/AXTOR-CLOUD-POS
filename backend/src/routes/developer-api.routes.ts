import { Router } from "express";
import { developerApiRateLimit, requireDeveloperApiKey, requireDeveloperScope } from "../middleware/developer-api.middleware.js";
import * as controller from "../controllers/developer-api.controller.js";

const router = Router();
router.get("/openapi.json", controller.openapi);
router.use(requireDeveloperApiKey);
router.use(developerApiRateLimit);
router.get("/status", requireDeveloperScope("developer.status.read"), controller.status);
router.get("/products", requireDeveloperScope("products.read"), controller.products);

export default router;
