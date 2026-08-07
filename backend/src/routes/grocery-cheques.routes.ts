import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireIndustry } from "../middleware/industry-guard.middleware.js";
import { requireAnyPermission } from "../middleware/permission.middleware.js";
import {
  groceryChequeCreate,
  groceryChequeGenerateReminders,
  groceryChequeList,
  groceryChequeTransition,
} from "../controllers/grocery-cheques.controller.js";

const router = Router();
router.use(requireAuth, requireIndustry("grocery"));

const chequeRead = requireAnyPermission("payments.view", "accounts.view", "reports.view");
const chequeWrite = requireAnyPermission("payments.create", "accounts.manage", "purchases.pay");

router.get("/cheques", chequeRead, groceryChequeList);
router.post("/cheques", chequeWrite, groceryChequeCreate);
router.patch("/cheques/:id/transition", chequeWrite, groceryChequeTransition);
router.post("/cheques/reminders/generate", chequeWrite, groceryChequeGenerateReminders);

export default router;