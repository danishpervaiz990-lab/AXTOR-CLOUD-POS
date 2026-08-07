import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireIndustry } from "../middleware/industry-guard.middleware.js";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware.js";
import { groceryCreateSale } from "../controllers/grocery-sales.controller.js";
import { groceryReceivePurchaseWithAccounting } from "../controllers/grocery-purchase-receive.controller.js";
import {
  groceryChequeCreate,
  groceryChequeGenerateReminders,
  groceryChequeList,
  groceryChequeTransition,
} from "../controllers/grocery-cheques.controller.js";
import {
  groceryAgeing,
  groceryContext,
  groceryCreatePurchaseOrder,
  groceryCustomerOverview,
  groceryExpiry,
  groceryHeldSaleCreate,
  groceryHeldSaleDelete,
  groceryHeldSaleList,
  groceryPurchaseStatus,
  grocerySalesGuard,
  grocerySupplierOverview,
  saveGroceryCustomerProfile,
  saveGrocerySupplierProfile,
} from "../controllers/grocery-foundation.controller.js";

const router = Router();
router.use(requireAuth, requireIndustry("grocery"));

const chequeRead = requireAnyPermission("payments.view", "accounts.view", "reports.view");
const chequeWrite = requireAnyPermission("payments.create", "accounts.manage", "purchases.pay");

router.get("/context", requireAnyPermission("dashboard.view", "sales_documents.view", "inventory.view"), groceryContext);
router.get("/customers/:id/overview", requirePermission("customers.view"), groceryCustomerOverview);
router.patch("/customers/:id/profile", requirePermission("customers.manage"), saveGroceryCustomerProfile);
router.get("/suppliers/:id/overview", requirePermission("suppliers.view"), grocerySupplierOverview);
router.patch("/suppliers/:id/profile", requirePermission("suppliers.manage"), saveGrocerySupplierProfile);
router.get("/ageing", requireAnyPermission("reports.view", "customers.view", "suppliers.view"), groceryAgeing);
router.get("/expiry", requirePermission("inventory.view"), groceryExpiry);

router.post("/purchase-orders", requirePermission("purchases.create"), groceryCreatePurchaseOrder);
router.patch("/purchase-orders/:id/status", requirePermission("purchases.create"), groceryPurchaseStatus);
router.post("/purchase-orders/:id/receive", requirePermission("purchases.receive"), groceryReceivePurchaseWithAccounting);

router.get("/held-sales", requirePermission("sales_documents.view"), groceryHeldSaleList);
router.post("/held-sales", requirePermission("sales_documents.create"), groceryHeldSaleCreate);
router.delete("/held-sales/:id", requirePermission("sales_documents.create"), groceryHeldSaleDelete);
router.post("/sales", grocerySalesGuard, groceryCreateSale);

router.get("/cheques", chequeRead, groceryChequeList);
router.post("/cheques", chequeWrite, groceryChequeCreate);
router.patch("/cheques/:id/transition", chequeWrite, groceryChequeTransition);
router.post("/cheques/reminders/generate", chequeWrite, groceryChequeGenerateReminders);

export default router;