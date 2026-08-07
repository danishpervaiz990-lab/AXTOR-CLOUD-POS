import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireIndustry } from "../middleware/industry-guard.middleware.js";
import { requireAnyPermission, requirePermission } from "../middleware/permission.middleware.js";
import { groceryCreateSale } from "../controllers/grocery-sales.controller.js";
import { groceryPostPurchaseInvoice, groceryReceivePurchaseWithAccounting } from "../controllers/grocery-purchase-receive.controller.js";
import { groceryCustomerDetail } from "../controllers/grocery-customer-detail.controller.js";
import { groceryHeldSaleCreateV2, groceryHeldSaleDeleteV2, groceryHeldSaleListV2 } from "../controllers/grocery-held-sales.controller.js";
import { createGroceryCustomerPayment, createGrocerySupplierPayment } from "../controllers/grocery-accounting-payments.controller.js";
import {
  bootstrapGroceryAccounting,
  createGroceryExpense,
  createGroceryJournal,
  createGroceryStockCount,
  createGroceryTransfer,
  createGroceryVan,
  groceryChartOfAccounts,
  groceryCounterCashMovement,
  groceryCounters,
  groceryCounterSummary,
  groceryExpenseReport,
  groceryExpenses,
  groceryJournals,
  groceryProductLookup,
  groceryProductProfile,
  groceryReorderSuggestions,
  groceryTransfers,
  groceryVans,
  groceryVanStock,
  reconcileGroceryAccountingSource,
  saveGroceryCounterProfile,
  saveGroceryProductProfile,
  transitionGroceryJournal,
  transitionGroceryTransfer,
  updateGroceryStockCount,
  updateGroceryVan,
  approveGroceryStockCount,
} from "../controllers/grocery-operations.controller.js";
import {
  createGroceryVanCollection,
  createGroceryVanDamage,
  createGroceryVanReturn,
  createGroceryVanSale,
  groceryVanReconciliation,
} from "../controllers/grocery-van.controller.js";
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
  groceryExpiry,
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
const locationRead = requireAnyPermission("branches.view", "inventory.view");
const locationManage = requireAnyPermission("branches.manage", "inventory.warehouses.manage");
const accountingRead = requireAnyPermission("accounts.view", "reports.view");
const accountingManage = requirePermission("accounts.manage");

router.get("/context", requireAnyPermission("dashboard.view", "sales_documents.view", "inventory.view"), groceryContext);
router.get("/customers/:id/overview", requirePermission("customers.view"), groceryCustomerDetail);
router.patch("/customers/:id/profile", requirePermission("customers.manage"), saveGroceryCustomerProfile);
router.get("/suppliers/:id/overview", requirePermission("suppliers.view"), grocerySupplierOverview);
router.patch("/suppliers/:id/profile", requirePermission("suppliers.manage"), saveGrocerySupplierProfile);
router.get("/ageing", requireAnyPermission("reports.view", "customers.view", "suppliers.view"), groceryAgeing);
router.get("/expiry", requirePermission("inventory.view"), groceryExpiry);

router.get("/products/lookup", requireAnyPermission("products.view", "inventory.view", "sales_documents.create"), groceryProductLookup);
router.get("/products/:id/profile", requirePermission("products.view"), groceryProductProfile);
router.patch("/products/:id/profile", requirePermission("products.manage"), saveGroceryProductProfile);

router.post("/purchase-orders", requirePermission("purchases.create"), groceryCreatePurchaseOrder);
router.patch("/purchase-orders/:id/status", requirePermission("purchases.create"), groceryPurchaseStatus);
router.post("/purchase-orders/:id/receive", requirePermission("purchases.receive"), groceryReceivePurchaseWithAccounting);
router.post("/purchase-orders/:id/invoice", requirePermission("purchases.create"), groceryPostPurchaseInvoice);

router.get("/held-sales", requirePermission("sales_documents.view"), groceryHeldSaleListV2);
router.post("/held-sales", requirePermission("sales_documents.create"), groceryHeldSaleCreateV2);
router.delete("/held-sales/:id", requirePermission("sales_documents.create"), groceryHeldSaleDeleteV2);
router.post("/sales", grocerySalesGuard, groceryCreateSale);

router.get("/counters", locationRead, groceryCounters);
router.patch("/counters/:id/profile", locationManage, saveGroceryCounterProfile);
router.post("/shifts/:shiftId/cash-movements", requireAnyPermission("shifts.open", "shifts.close", "accounts.manage"), groceryCounterCashMovement);
router.get("/shifts/:shiftId/counter-summary", requireAnyPermission("shifts.view", "reports.view"), groceryCounterSummary);

router.get("/vans", locationRead, groceryVans);
router.post("/vans", locationManage, createGroceryVan);
router.patch("/vans/:id", locationManage, updateGroceryVan);
router.get("/vans/:id/stock", requirePermission("inventory.view"), groceryVanStock);
router.post("/vans/:id/sales", requirePermission("sales_documents.create"), createGroceryVanSale);
router.post("/vans/:id/collections", requirePermission("payments.create"), createGroceryVanCollection);
router.post("/vans/:id/returns", requireAnyPermission("sales_returns.create", "sales_documents.create"), createGroceryVanReturn);
router.post("/vans/:id/damaged", requirePermission("inventory.adjust"), createGroceryVanDamage);
router.get("/vans/:id/reconciliation", requireAnyPermission("inventory.view", "reports.view"), groceryVanReconciliation);

router.get("/transfers", requirePermission("inventory.view"), groceryTransfers);
router.post("/transfers", requirePermission("inventory.transfer"), createGroceryTransfer);
router.patch("/transfers/:id/status", requirePermission("inventory.transfer"), transitionGroceryTransfer);

router.post("/stock-counts", requirePermission("inventory.count"), createGroceryStockCount);
router.patch("/stock-counts/:id", requirePermission("inventory.count"), updateGroceryStockCount);
router.post("/stock-counts/:id/approve", requirePermission("inventory.count"), approveGroceryStockCount);
router.get("/reorder-suggestions", requirePermission("inventory.view"), groceryReorderSuggestions);

router.get("/accounting/chart", accountingRead, groceryChartOfAccounts);
router.post("/accounting/bootstrap", accountingManage, bootstrapGroceryAccounting);
router.get("/journals", accountingRead, groceryJournals);
router.post("/journals", accountingManage, createGroceryJournal);
router.patch("/journals/:id/status", accountingManage, transitionGroceryJournal);
router.post("/accounting/reconcile/:type/:id", accountingManage, reconcileGroceryAccountingSource);

router.get("/expenses", requirePermission("expenses.view"), groceryExpenses);
router.post("/expenses", requirePermission("expenses.manage"), createGroceryExpense);
router.get("/expense-report", requireAnyPermission("expenses.view", "reports.view"), groceryExpenseReport);
router.post("/customer-payments", requirePermission("payments.create"), createGroceryCustomerPayment);
router.post("/supplier-payments", requirePermission("purchases.pay"), createGrocerySupplierPayment);

router.get("/cheques", chequeRead, groceryChequeList);
router.post("/cheques", chequeWrite, groceryChequeCreate);
router.patch("/cheques/:id/transition", chequeWrite, groceryChequeTransition);
router.post("/cheques/reminders/generate", chequeWrite, groceryChequeGenerateReminders);

export default router;
