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
  ["payments.view", "View customer payments", "Payments"],
  ["payments.create", "Receive customer payments", "Payments"],
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
  ["branches.view", "View branches and counters", "Operations"],
  ["branches.manage", "Manage branches and counters", "Operations"],
  ["shifts.view", "View shifts and closing summaries", "Operations"],
  ["shifts.open", "Open shifts", "Operations"],
  ["shifts.close", "Close shifts", "Operations"],
  ["salespeople.view", "View salespeople and performance", "Salespeople"],
  ["salespeople.manage", "Manage salespeople and targets", "Salespeople"],
  ["salespeople.payouts", "Manage commission payouts", "Salespeople"],
  ["accounts.view", "View accounts and transactions", "Accounting"],
  ["accounts.manage", "Create accounts and transactions", "Accounting"],
  ["accounts.reconcile", "Reconcile accounts", "Accounting"],
  ["expenses.view", "View expenses", "Accounting"],
  ["expenses.manage", "Create and update expenses", "Accounting"],
  ["reports.view", "View operational reports", "Reports"],
  ["reports.profit", "View profit and margin reports", "Reports"],
  ["reports.audit", "View audit and control reports", "Reports"],
  ["settings.view", "View company and application settings", "Settings"],
  ["settings.manage", "Manage company and application settings", "Settings"],
  ["settings.export", "Export company data", "Settings"],
  ["audit_logs.view", "View audit logs", "Administration"],
  ["settings.manage_permissions", "Manage users and role permissions", "Administration"],
] as const satisfies readonly PermissionDefinition[];

export type SystemRoleDefinition = {
  name: string;
  description: string;
  permissions: readonly string[];
  legacyPermissions?: readonly string[];
};

const managerLegacy = [
  "sales_documents.view",
  "sales_documents.create",
  "sales_documents.save_draft",
  "sales_documents.post",
  "sales_documents.change_document_type",
  "sales_documents.change_salesperson",
  "sales_documents.edit_draft",
  "sales_documents.edit_posted",
  "sales_documents.return",
  "sales_documents.refund",
  "payments.create",
] as const;

const cashierLegacy = [
  "sales_documents.view",
  "sales_documents.create",
  "sales_documents.save_draft",
  "sales_documents.post",
  "payments.create",
] as const;

const salespersonLegacy = [
  "sales_documents.view",
  "sales_documents.create",
  "sales_documents.save_draft",
  "sales_documents.post",
] as const;

const storekeeperLegacy = ["sales_documents.view"] as const;

const managerPermissions = [
  "dashboard.view",
  ...managerLegacy,
  "payments.view",
  "customers.view",
  "customers.manage",
  "customers.credit_manage",
  "products.view",
  "products.manage",
  "products.view_cost",
  "inventory.view",
  "inventory.warehouses.manage",
  "inventory.adjust",
  "inventory.transfer",
  "inventory.count",
  "suppliers.view",
  "suppliers.manage",
  "purchases.view",
  "purchases.create",
  "purchases.receive",
  "purchases.return",
  "purchases.pay",
  "purchases.cancel",
  "branches.view",
  "branches.manage",
  "shifts.view",
  "shifts.open",
  "shifts.close",
  "salespeople.view",
  "salespeople.manage",
  "salespeople.payouts",
  "accounts.view",
  "expenses.view",
  "expenses.manage",
  "reports.view",
  "reports.profit",
  "settings.view",
] as const;

const cashierPermissions = [
  "dashboard.view",
  ...cashierLegacy,
  "payments.view",
  "customers.view",
  "products.view",
  "inventory.view",
  "branches.view",
  "shifts.view",
  "shifts.open",
  "shifts.close",
  "salespeople.view",
] as const;

const salespersonPermissions = [
  "dashboard.view",
  ...salespersonLegacy,
  "customers.view",
  "products.view",
  "inventory.view",
  "branches.view",
  "salespeople.view",
] as const;

const storekeeperPermissions = [
  "dashboard.view",
  "sales_documents.view",
  "products.view",
  "products.manage",
  "products.view_cost",
  "inventory.view",
  "inventory.warehouses.manage",
  "inventory.adjust",
  "inventory.transfer",
  "inventory.count",
  "suppliers.view",
  "purchases.view",
  "purchases.create",
  "purchases.receive",
  "purchases.return",
  "branches.view",
  "reports.view",
] as const;

const accountantPermissions = [
  "dashboard.view",
  "sales_documents.view",
  "payments.view",
  "payments.create",
  "customers.view",
  "customers.credit_manage",
  "products.view",
  "products.view_cost",
  "inventory.view",
  "suppliers.view",
  "purchases.view",
  "purchases.pay",
  "branches.view",
  "shifts.view",
  "salespeople.view",
  "accounts.view",
  "accounts.manage",
  "accounts.reconcile",
  "expenses.view",
  "expenses.manage",
  "reports.view",
  "reports.profit",
  "settings.view",
  "settings.export",
] as const;

const auditorPermissions = [
  "dashboard.view",
  "sales_documents.view",
  "payments.view",
  "customers.view",
  "products.view",
  "products.view_cost",
  "inventory.view",
  "suppliers.view",
  "purchases.view",
  "branches.view",
  "shifts.view",
  "salespeople.view",
  "accounts.view",
  "expenses.view",
  "reports.view",
  "reports.profit",
  "reports.audit",
  "settings.view",
  "settings.export",
  "audit_logs.view",
] as const;

export const systemRoleDefinitions: readonly SystemRoleDefinition[] = [
  { name: "Admin", description: "Full operational access for a trusted administrator", permissions: ["*"], legacyPermissions: ["*"] },
  { name: "Manager", description: "Manage daily operations, staff, stock, purchasing and reports", permissions: managerPermissions, legacyPermissions: managerLegacy },
  { name: "Cashier", description: "Create counter sales, receive payments and operate assigned shifts", permissions: cashierPermissions, legacyPermissions: cashierLegacy },
  { name: "Salesperson", description: "Create assigned sales documents and serve customers", permissions: salespersonPermissions },
  { name: "Salesman", description: "Legacy salesperson role retained for existing tenants", permissions: salespersonPermissions, legacyPermissions: salespersonLegacy },
  { name: "Storekeeper", description: "Manage warehouses, stock counts, transfers and goods receipts", permissions: storekeeperPermissions },
  { name: "Warehouse", description: "Legacy storekeeper role retained for existing tenants", permissions: storekeeperPermissions, legacyPermissions: storekeeperLegacy },
  { name: "Accountant", description: "Manage receivables, payables, accounts, expenses and finance reports", permissions: accountantPermissions },
  { name: "Auditor", description: "Read-only access to operational, financial and audit evidence", permissions: auditorPermissions },
] as const;

function normalizedRoleFamily(name: unknown): string {
  const value = String(name || "").trim().toLowerCase();
  if (value.includes("owner")) return "owner";
  if (value.includes("admin")) return "admin";
  if (value.includes("manager") || value.includes("supervisor")) return "manager";
  if (value.includes("cashier") || value.includes("till operator")) return "cashier";
  if (value.includes("accountant") || value.includes("finance")) return "accountant";
  if (value.includes("auditor") || value === "audit") return "auditor";
  if (value.includes("storekeeper") || value.includes("warehouse")) return "storekeeper";
  if (value.includes("salesperson") || value.includes("salesman") || value.includes("sales representative") || value.includes("van sales")) return "salesperson";
  return value;
}

export function findSystemRoleDefinition(name: unknown): SystemRoleDefinition | undefined {
  const exact = systemRoleDefinitions.find((role) => role.name.toLowerCase() === String(name || "").trim().toLowerCase());
  if (exact) return exact;
  const family = normalizedRoleFamily(name);
  const canonicalName = family === "salesperson" ? "Salesperson" : family === "storekeeper" ? "Storekeeper" : family.charAt(0).toUpperCase() + family.slice(1);
  return systemRoleDefinitions.find((role) => role.name === canonicalName);
}

function normalizedPermissionSet(values: unknown): string[] {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))].sort();
}

function samePermissionSet(left: unknown, right: unknown): boolean {
  const a = normalizedPermissionSet(left);
  const b = normalizedPermissionSet(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function shouldUpgradeLegacySystemRolePermissions(name: unknown, storedPermissions: unknown): boolean {
  const definition = findSystemRoleDefinition(name);
  return Boolean(definition?.legacyPermissions && samePermissionSet(storedPermissions, definition.legacyPermissions));
}

export function effectivePermissionsForRole(name: unknown, storedPermissions: unknown): string[] {
  const definition = findSystemRoleDefinition(name);
  if (definition && shouldUpgradeLegacySystemRolePermissions(name, storedPermissions)) return [...definition.permissions];
  return normalizedPermissionSet(storedPermissions);
}
