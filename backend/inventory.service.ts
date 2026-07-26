import type { Request } from "express";

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

export async function loadUserAccess(tx: any, businessId: string, userId?: string | null): Promise<UserAccess> {
  if (!userId) throw new Error("Authenticated user context is required");

  const user = await tx.user.findFirst({
    where: { id: userId, businessId, status: "ACTIVE" },
    include: { userRoles: { include: { role: true } } },
  });

  if (!user) throw new Error("Authenticated user is no longer active");

  const roleNames = (user.userRoles || []).map((entry: any) => String(entry.role?.name || "").trim()).filter(Boolean);
  const normalizedRoles = roleNames.map((name: string) => name.toLowerCase());
  const permissions = new Set<string>();

  for (const entry of user.userRoles || []) {
    for (const permission of entry.role?.permissions || []) {
      const value = String(permission || "").trim();
      if (value) permissions.add(value);
    }
  }

  return {
    userId: user.id,
    businessId,
    branchId: user.branchId || null,
    userName: user.name,
    roleNames,
    permissions,
    isOwner: normalizedRoles.some((role: string) => role.includes("owner")),
    isAdmin: normalizedRoles.some((role: string) => role.includes("admin")),
    isManager: normalizedRoles.some((role: string) => role.includes("manager")),
  };
}

export function hasPermission(access: UserAccess, permission: string, legacyDefault = false): boolean {
  if (access.isOwner || access.isAdmin) return true;
  if (access.permissions.has("*") || access.permissions.has(permission)) return true;

  const segments = permission.split(".");
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const wildcard = `${segments.slice(0, index).join(".")}.*`;
    if (access.permissions.has(wildcard)) return true;
  }

  // Backward compatibility: existing installations may have roles but no populated permission array yet.
  if (legacyDefault && access.permissions.size === 0) return true;
  return false;
}

export function requirePermission(access: UserAccess, permission: string, legacyDefault = false): void {
  if (!hasPermission(access, permission, legacyDefault)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

export function requestIp(req: Request): string | null {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  return forwarded || req.socket.remoteAddress || null;
}
