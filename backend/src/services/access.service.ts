import type { Request } from "express";
import { effectivePermissionsForRole } from "./system-role-definitions.js";

export type UserAccess = {
  userId: string;
  businessId: string;
  branchId: string | null;
  userName: string;
  roleNames: string[];
  permissions: Set<string>;
  isOwner: boolean;
  isAdmin: boolean;
  isManager: boolean;
};

const exactOnlyPermissions = new Set([
  "sales_documents.change_salesperson",
  "sales_documents.cross_branch",
  "sales_documents.backdate",
  "sales_documents.override_credit_limit",
  "sales_documents.allow_negative_stock",
  "sales_documents.edit_posted",
  "sales_documents.edit_paid",
  "sales_documents.edit_returned",
  "sales_documents.edit_refunded",
  "sales_documents.override_financials",
  "sales_documents.override_stock",
  "sales_documents.void",
  "discounts.override",
  "pricing.manual_override",
  "loyalty.adjust",
  "journals.post",
  "supplier_payments.post",
  "settings.manage_permissions",
]);

export async function loadUserAccess(tx: any, businessId: string, userId?: string | null): Promise<UserAccess> {
  if (!userId) throw new Error("Authenticated user context is required");
  const user = await tx.user.findFirst({ where: { id: userId, businessId, status: "ACTIVE" }, include: { userRoles: { include: { role: true } } } });
  if (!user) throw new Error("Authenticated user is no longer active");
  const roleNames = (user.userRoles || []).map((entry: any) => String(entry.role?.name || "").trim()).filter(Boolean);
  const normalizedRoles = roleNames.map((name: string) => name.toLowerCase());
  const permissions = new Set<string>();
  for (const entry of user.userRoles || []) {
    for (const permission of effectivePermissionsForRole(entry.role?.name, entry.role?.permissions)) {
      const value = String(permission || "").trim(); if (value) permissions.add(value);
    }
  }
  return { userId: user.id, businessId, branchId: user.branchId || null, userName: user.name, roleNames, permissions,
    isOwner: normalizedRoles.some((role: string) => role.includes("owner")),
    isAdmin: normalizedRoles.some((role: string) => role.includes("admin")),
    isManager: normalizedRoles.some((role: string) => role.includes("manager")),
  };
}

export function hasPermission(access: UserAccess, permission: string, legacyDefault = false): boolean {
  if (access.isOwner || access.isAdmin) return true;
  if (access.permissions.has("*") || access.permissions.has(permission)) return true;
  if (exactOnlyPermissions.has(permission)) return false;
  const segments = permission.split(".");
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const wildcard = `${segments.slice(0, index).join(".")}.*`;
    if (access.permissions.has(wildcard)) return true;
  }
  if (legacyDefault && access.permissions.size === 0) return true;
  return false;
}
export function requirePermission(access: UserAccess, permission: string, legacyDefault = false): void { if (!hasPermission(access, permission, legacyDefault)) throw new Error(`Permission denied: ${permission}`); }
export function requestIp(req: Request): string | null { const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim(); return forwarded || req.socket.remoteAddress || null; }
