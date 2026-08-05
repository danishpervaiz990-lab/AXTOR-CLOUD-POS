import type { TenantContext } from "@/server/tenancy/context";

export const PERMISSIONS = [
  "dashboard.view",
  "products.view",
  "products.manage",
  "inventory.view",
  "inventory.manage",
  "inventory.adjust",
  "inventory.transfer",
  "inventory.override_expiry",
  "purchases.view",
  "purchases.manage",
  "purchases.approve",
  "suppliers.view",
  "suppliers.manage",
  "customers.view",
  "customers.manage",
  "customer_credit.view",
  "customer_credit.manage",
  "customer_credit.override",
  "sales.view",
  "sales.create",
  "sales.cancel",
  "sales.edit_completed",
  "sales.discount",
  "sales.override_discount",
  "sales.override_price",
  "returns.create",
  "refunds.create",
  "refunds.approve",
  "payments.view",
  "payments.create",
  "payments.reverse",
  "payment_accounts.view",
  "payment_accounts.manage",
  "cheques.view",
  "cheques.create_inward",
  "cheques.create_outward",
  "cheques.approve_outward",
  "cheques.allocate",
  "cheques.deposit",
  "cheques.submit",
  "cheques.clear",
  "cheques.bounce",
  "cheques.return",
  "cheques.stop",
  "cheques.cancel",
  "cheques.replace",
  "cheques.download_attachment",
  "shifts.open",
  "shifts.close",
  "shifts.reopen",
  "expenses.view",
  "expenses.manage",
  "reports.operational",
  "reports.financial",
  "reports.cost_profit",
  "reports.export",
  "users.manage",
  "roles.manage",
  "settings.manage",
  "audit.view"
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Role = TenantContext["role"];

const allPermissions = new Set<Permission>(PERMISSIONS);

const rolePermissions: Record<Role, ReadonlySet<Permission>> = {
  OWNER: allPermissions,
  ADMINISTRATOR: new Set(PERMISSIONS.filter((permission) => permission !== "roles.manage")),
  MANAGER: new Set([
    "dashboard.view", "products.view", "products.manage", "inventory.view", "inventory.manage",
    "inventory.adjust", "inventory.transfer", "purchases.view", "purchases.manage", "purchases.approve",
    "suppliers.view", "suppliers.manage", "customers.view", "customers.manage", "customer_credit.view",
    "customer_credit.manage", "customer_credit.override", "sales.view", "sales.create", "sales.cancel",
    "sales.discount", "sales.override_discount", "sales.override_price", "returns.create", "refunds.create",
    "refunds.approve", "payments.view", "payments.create", "cheques.view", "cheques.create_inward",
    "cheques.create_outward", "cheques.approve_outward", "cheques.allocate", "cheques.deposit",
    "cheques.submit", "shifts.open", "shifts.close", "expenses.view", "expenses.manage",
    "reports.operational", "reports.financial", "reports.cost_profit", "reports.export", "audit.view"
  ]),
  CASHIER: new Set([
    "dashboard.view", "products.view", "inventory.view", "customers.view", "customers.manage",
    "customer_credit.view", "sales.view", "sales.create", "sales.discount", "returns.create",
    "payments.view", "payments.create", "cheques.view", "cheques.create_inward", "shifts.open",
    "shifts.close", "reports.operational"
  ]),
  INVENTORY_MANAGER: new Set([
    "dashboard.view", "products.view", "products.manage", "inventory.view", "inventory.manage",
    "inventory.adjust", "inventory.transfer", "inventory.override_expiry", "purchases.view",
    "purchases.manage", "suppliers.view", "suppliers.manage", "reports.operational", "reports.export"
  ]),
  ACCOUNTANT: new Set([
    "dashboard.view", "customers.view", "customer_credit.view", "suppliers.view", "sales.view",
    "purchases.view", "payments.view", "payments.create", "payments.reverse", "payment_accounts.view",
    "payment_accounts.manage", "cheques.view", "cheques.create_inward", "cheques.create_outward",
    "cheques.allocate", "cheques.deposit", "cheques.submit", "cheques.clear", "cheques.bounce",
    "cheques.return", "cheques.stop", "cheques.cancel", "cheques.replace",
    "cheques.download_attachment", "expenses.view", "expenses.manage", "reports.operational",
    "reports.financial", "reports.cost_profit", "reports.export", "audit.view"
  ]),
  SALESPERSON: new Set([
    "dashboard.view", "products.view", "inventory.view", "customers.view", "customers.manage",
    "customer_credit.view", "sales.view", "sales.create", "sales.discount", "returns.create",
    "payments.view", "payments.create", "reports.operational"
  ]),
  VIEWER_AUDITOR: new Set([
    "dashboard.view", "products.view", "inventory.view", "purchases.view", "suppliers.view",
    "customers.view", "customer_credit.view", "sales.view", "payments.view", "payment_accounts.view",
    "cheques.view", "expenses.view", "reports.operational", "reports.financial", "audit.view"
  ])
};

export function hasPermission(context: TenantContext, permission: Permission): boolean {
  return rolePermissions[context.role].has(permission);
}

export function requirePermission(context: TenantContext, permission: Permission): void {
  if (!hasPermission(context, permission)) {
    throw new Error("PERMISSION_DENIED");
  }
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return [...rolePermissions[role]];
}
