export type PermissionDefinition = readonly [key: string, label: string, group: string];

export const permissionDefinitions = [
  ["dashboard.view", "View dashboard", "Dashboard"],
  ["sales_documents.view", "View sales documents", "Sales"],
  ["sales_documents.create", "Create sales documents", "Sales"],
  ["sales_documents.save_draft", "Save sales drafts", "Sales"],
  ["sales_documents.post", "Post sales documents", "Sales"],
  ["sales_documents.change_document_type", "Change document type", "Sales"],
  ["sales_documents.change_salesperson", "Change sales person", "Sales"],
  ["sales_documents.cross_branch", "Create cross-branch sales", "Branch"],
  ["sales_documents.backdate", "Backdate sales documents", "Controls"],
  ["sales_documents.override_credit_limit", "Override customer credit limit", "Controls"],
  ["sales_documents.allow_negative_stock", "Allow negative stock", "Stock"],
  ["sales_documents.edit_draft", "Edit draft documents", "Editing"],
  ["sales_documents.edit_posted", "Edit posted documents", "Editing"],
  ["sales_documents.edit_paid", "Edit paid documents", "Editing"],
  ["sales_documents.edit_returned", "Edit returned document headers", "Editing"],
  ["sales_documents.edit_refunded", "Edit refunded document headers", "Editing"],
  ["sales_documents.override_financials", "Override posted financial values", "Overrides"],
  ["sales_documents.override_stock", "Reverse and repost stock on edit", "Overrides"],
  ["sales_documents.return", "Post sales returns", "Returns"],
  ["sales_documents.refund", "Refund customers", "Returns"],
  ["sales_documents.void", "Void posted sales", "Sensitive Sales"],
  ["discounts.override", "Override normal discount controls", "Sensitive Sales"],
  ["pricing.view", "View selling price levels and history", "Pricing"],
  ["pricing.manage", "Manage price levels and customer prices", "Pricing"],
  ["pricing.manual_override", "Manually override POS selling price", "Sensitive Sales"],
  ["promotions.view", "View promotions and offers", "Promotions"],
  ["promotions.create", "Create promotions", "Promotions"],
  ["promotions.edit", "Edit promotions", "Promotions"],
  ["promotions.delete", "Deactivate promotions", "Promotions"],
  ["promotions.manage", "Manage all promotion rules", "Promotions"],
  ["promotions.apply", "Apply valid promotions at POS", "Promotions"],
  ["loyalty.view", "View loyalty balances and history", "Loyalty"],
  ["loyalty.manage", "Manage loyalty program configuration", "Loyalty"],
  ["loyalty.redeem", "Redeem customer loyalty points", "Loyalty"],
  ["loyalty.adjust", "Manually adjust customer loyalty points", "Loyalty"],
  ["payments.view", "View customer payments", "Payments"],
  ["payments.create", "Receive customer payments", "Payments"],
  ["cheques.manage", "Create and transition inward/outward cheques", "Payments"],
  ["customers.view", "View customers and balances", "Customers"],
  ["customers.manage", "Create and update customers", "Customers"],
  ["customers.credit_manage", "Manage customer credit limits and terms", "Customers"],
  ["products.view", "View products and selling prices", "Products"],
  ["products.manage", "Create and update products", "Products"],
  ["products.view_cost", "View product cost and margin", "Products"],
  ["inventory.view", "View stock, movements and valuation", "Inventory"],
  ["inventory.warehouses.manage", "Manage warehouses", "Inventory"],
  ["inventory.adjust", "Post stock adjustments", "Inventory"],
  ["inventory.transfer", "Transfer stock between warehouses", "Inventory"],
  ["inventory.count", "Approve stock counts", "Inventory"],
  ["suppliers.view", "View suppliers and statements", "Purchasing"],
  ["suppliers.manage", "Create and update suppliers", "Purchasing"],
  ["purchases.view", "View purchases and goods receipts", "Purchasing"],
  ["purchases.create", "Create and update purchases", "Purchasing"],
  ["purchases.receive", "Receive purchased stock", "Purchasing"],
  ["purchases.return", "Post purchase returns", "Purchasing"],
  ["purchases.pay", "Post supplier payments", "Purchasing"],
  ["purchases.cancel", "Cancel purchase documents", "Purchasing"],
  ["purchases.approve", "Approve purchase workflow", "Purchasing"],
  ["supplier_payments.post", "Post supplier payment vouchers", "Sensitive Accounting"],
  ["branches.view", "View branches and counters", "Operations"],
  ["branches.manage", "Manage branches and counters", "Operations"],
  ["shifts.view", "View shifts and closing summaries", "Operations"],
  ["shifts.open", "Open shifts", "Operations"],
  ["shifts.close", "Close counters and shifts", "Sensitive Operations"],
  ["salespeople.view", "View salespeople and performance", "Salespeople"],
  ["salespeople.manage", "Manage salespeople and targets", "Salespeople"],
  ["salespeople.payouts", "Manage commission payouts", "Salespeople"],
  ["accounts.view", "View accounts and transactions", "Accounting"],
  ["accounts.manage", "Create accounts and transactions", "Accounting"],
  ["accounts.reconcile", "Reconcile accounts", "Accounting"],
  ["journals.view", "View journal entries", "Accounting"],
  ["journals.create", "Create journal entries", "Accounting"],
  ["journals.edit", "Edit draft journal entries", "Accounting"],
  ["journals.post", "Approve/post/reverse journal entries", "Sensitive Accounting"],
  ["expenses.view", "View expenses", "Accounting"],
  ["expenses.manage", "Create and update expenses", "Accounting"],
  ["reports.view", "View operational reports", "Reports"],
  ["reports.profit", "View profit and margin reports", "Reports"],
  ["reports.pnl", "View Profit & Loss", "Sensitive Reports"],
  ["reports.balance_sheet", "View Balance Sheet", "Sensitive Reports"],
  ["reports.trial_balance", "View Trial Balance", "Sensitive Reports"],
  ["reports.ledger", "View General and Account Ledgers", "Sensitive Reports"],
  ["reports.audit", "View audit and control reports", "Reports"],
  ["reports.print", "Print reports", "Reports"],
  ["reports.export", "Export reports", "Reports"],
  ["settings.view", "View company and application settings", "Settings"],
  ["settings.manage", "Manage company and application settings", "Settings"],
  ["settings.export", "Export company data", "Settings"],
  ["audit_logs.view", "View audit logs", "Administration"],
  ["settings.manage_permissions", "Manage users and role permissions", "Administration"],
] as const satisfies readonly PermissionDefinition[];

export type SystemRoleDefinition = { name: string; description: string; permissions: readonly string[]; legacyPermissions?: readonly string[] };

const managerLegacy = ["sales_documents.view","sales_documents.create","sales_documents.save_draft","sales_documents.post","sales_documents.change_document_type","sales_documents.change_salesperson","sales_documents.edit_draft","sales_documents.edit_posted","sales_documents.return","sales_documents.refund","payments.create"] as const;
const cashierLegacy = ["sales_documents.view","sales_documents.create","sales_documents.save_draft","sales_documents.post","payments.create"] as const;
const salespersonLegacy = ["sales_documents.view","sales_documents.create","sales_documents.save_draft","sales_documents.post"] as const;
const storekeeperLegacy = ["sales_documents.view"] as const;

const managerPermissions = [
  "dashboard.view",...managerLegacy,"sales_documents.void","discounts.override","pricing.view","pricing.manage","pricing.manual_override",
  "promotions.view","promotions.create","promotions.edit","promotions.delete","promotions.manage","promotions.apply",
  "loyalty.view","loyalty.manage","loyalty.redeem","payments.view","cheques.manage","customers.view","customers.manage","customers.credit_manage",
  "products.view","products.manage","products.view_cost","inventory.view","inventory.warehouses.manage","inventory.adjust","inventory.transfer","inventory.count",
  "suppliers.view","suppliers.manage","purchases.view","purchases.create","purchases.receive","purchases.return","purchases.pay","purchases.cancel","purchases.approve","supplier_payments.post",
  "branches.view","branches.manage","shifts.view","shifts.open","shifts.close","salespeople.view","salespeople.manage","salespeople.payouts",
  "accounts.view","journals.view","expenses.view","expenses.manage","reports.view","reports.profit","reports.pnl","reports.balance_sheet","reports.trial_balance","reports.ledger","reports.print","reports.export","settings.view",
] as const;
const cashierPermissions = ["dashboard.view",...cashierLegacy,"payments.view","customers.view","products.view","pricing.view","promotions.view","promotions.apply","loyalty.view","loyalty.redeem","inventory.view","branches.view","shifts.view","shifts.open","shifts.close","salespeople.view"] as const;
const salespersonPermissions = ["dashboard.view",...salespersonLegacy,"customers.view","products.view","pricing.view","promotions.view","promotions.apply","loyalty.view","inventory.view","branches.view","salespeople.view"] as const;
const storekeeperPermissions = ["dashboard.view","sales_documents.view","products.view","products.manage","products.view_cost","inventory.view","inventory.warehouses.manage","inventory.adjust","inventory.transfer","inventory.count","suppliers.view","purchases.view","purchases.create","purchases.receive","purchases.return","branches.view","reports.view"] as const;
const accountantPermissions = ["dashboard.view","sales_documents.view","payments.view","payments.create","cheques.manage","customers.view","customers.credit_manage","products.view","products.view_cost","inventory.view","suppliers.view","purchases.view","purchases.pay","supplier_payments.post","branches.view","shifts.view","salespeople.view","accounts.view","accounts.manage","accounts.reconcile","journals.view","journals.create","journals.edit","journals.post","expenses.view","expenses.manage","reports.view","reports.profit","reports.pnl","reports.balance_sheet","reports.trial_balance","reports.ledger","reports.print","reports.export","settings.view","settings.export"] as const;
const auditorPermissions = ["dashboard.view","sales_documents.view","payments.view","customers.view","products.view","products.view_cost","inventory.view","suppliers.view","purchases.view","branches.view","shifts.view","salespeople.view","accounts.view","journals.view","expenses.view","reports.view","reports.profit","reports.pnl","reports.balance_sheet","reports.trial_balance","reports.ledger","reports.audit","reports.print","reports.export","settings.view","settings.export","audit_logs.view"] as const;
const purchaseManagerPermissions = ["dashboard.view","suppliers.view","suppliers.manage","products.view","products.view_cost","inventory.view","purchases.view","purchases.create","purchases.receive","purchases.return","purchases.pay","purchases.cancel","purchases.approve","supplier_payments.post","branches.view","accounts.view","expenses.view","reports.view","reports.print","reports.export"] as const;
const warehouseManagerPermissions = ["dashboard.view","products.view","products.manage","products.view_cost","inventory.view","inventory.warehouses.manage","inventory.adjust","inventory.transfer","inventory.count","suppliers.view","purchases.view","purchases.receive","branches.view","branches.manage","reports.view","reports.print","reports.export"] as const;

export const systemRoleDefinitions: readonly SystemRoleDefinition[] = [
  { name: "Owner", description: "Business owner with full tenant access", permissions: ["*"] },
  { name: "Admin", description: "Full operational access for a trusted administrator", permissions: ["*"], legacyPermissions: ["*"] },
  { name: "Manager", description: "Manage daily operations, staff, stock, purchasing and reports", permissions: managerPermissions, legacyPermissions: managerLegacy },
  { name: "Accountant", description: "Manage receivables, payables, accounts, journals, expenses and finance reports", permissions: accountantPermissions },
  { name: "Purchase Manager", description: "Manage supplier purchasing, returns, approvals and supplier payments", permissions: purchaseManagerPermissions },
  { name: "Warehouse Manager", description: "Manage warehouse stock, transfers, adjustments and counts", permissions: warehouseManagerPermissions },
  { name: "Cashier", description: "Create counter sales, receive payments and operate assigned shifts", permissions: cashierPermissions, legacyPermissions: cashierLegacy },
  { name: "Salesperson", description: "Create assigned sales documents and serve customers", permissions: salespersonPermissions },
  { name: "Salesman", description: "Legacy salesperson role retained for existing tenants", permissions: salespersonPermissions, legacyPermissions: salespersonLegacy },
  { name: "Storekeeper", description: "Manage warehouses, stock counts, transfers and goods receipts", permissions: storekeeperPermissions },
  { name: "Warehouse", description: "Legacy storekeeper role retained for existing tenants", permissions: storekeeperPermissions, legacyPermissions: storekeeperLegacy },
  { name: "Auditor", description: "Read-only access to operational, financial and audit evidence", permissions: auditorPermissions },
] as const;

function normalizedRoleFamily(name: unknown): string {
  const value = String(name || "").trim().toLowerCase();
  if (value.includes("owner")) return "owner";
  if (value.includes("admin")) return "admin";
  if (value.includes("purchase") && value.includes("manager")) return "purchase_manager";
  if (value.includes("warehouse") && value.includes("manager")) return "warehouse_manager";
  if (value.includes("manager") || value.includes("supervisor")) return "manager";
  if (value.includes("cashier") || value.includes("till operator")) return "cashier";
  if (value.includes("accountant") || value.includes("finance")) return "accountant";
  if (value.includes("auditor") || value === "audit") return "auditor";
  if (value.includes("storekeeper") || value === "warehouse") return "storekeeper";
  if (value.includes("salesperson") || value.includes("salesman") || value.includes("sales representative") || value.includes("van sales")) return "salesperson";
  return value;
}

export function findSystemRoleDefinition(name: unknown): SystemRoleDefinition | undefined {
  const exact = systemRoleDefinitions.find((role) => role.name.toLowerCase() === String(name || "").trim().toLowerCase()); if (exact) return exact;
  const family = normalizedRoleFamily(name);
  const canonicalName = family === "salesperson" ? "Salesperson" : family === "storekeeper" ? "Storekeeper" : family === "purchase_manager" ? "Purchase Manager" : family === "warehouse_manager" ? "Warehouse Manager" : family.charAt(0).toUpperCase() + family.slice(1);
  return systemRoleDefinitions.find((role) => role.name === canonicalName);
}
function normalizedPermissionSet(values: unknown): string[] { return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))].sort(); }
function samePermissionSet(left: unknown, right: unknown): boolean { const a = normalizedPermissionSet(left), b = normalizedPermissionSet(right); return a.length === b.length && a.every((value, index) => value === b[index]); }
export function shouldUpgradeLegacySystemRolePermissions(name: unknown, storedPermissions: unknown): boolean { const definition = findSystemRoleDefinition(name); return Boolean(definition?.legacyPermissions && samePermissionSet(storedPermissions, definition.legacyPermissions)); }
export function effectivePermissionsForRole(name: unknown, storedPermissions: unknown): string[] { const definition = findSystemRoleDefinition(name); if (definition && shouldUpgradeLegacySystemRolePermissions(name, storedPermissions)) return [...definition.permissions]; return normalizedPermissionSet(storedPermissions); }
