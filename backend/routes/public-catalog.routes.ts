import { Router } from "express";
import * as controller from "../controllers/public-catalog.controller.js";
import { registrationRateLimit } from "../middleware/security.middleware.js";

const router = Router();

router.get("/catalog", controller.catalog);
router.get("/industries/:code", controller.industry);
router.post("/register", registrationRateLimit, controller.register);

export default router;
