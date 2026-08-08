import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";
import { writeAudit } from "../services/audit.service.js";
import { permissionDefinitions } from "../services/system-role-definitions.js";

function businessId(req: Request) {
  return req.tenant?.businessId ?? undefined;
}

function userId(req: Request) {
  return req.tenant?.userId ?? undefined;
}

function text(value: unknown) {
  const result = String(value ?? "").trim();
  return result || undefined;
}

function isPermissionDenied(error: unknown): boolean {
  return /^Permission denied:/i.test(String((error as any)?.message || error || ""));
}

async function requireAccessAdministrator(tx: any, req: Request, bid: string) {
  const access = await loadUserAccess(tx, bid, userId(req));
  if (!(access.isOwner || access.isAdmin || hasPermission(access, "settings.manage_permissions"))) {
    throw new Error("Permission denied: settings.manage_permissions");
  }
  return access;
}

export async function getAccessControlV2(req: Request, res: Response) {
  try {
    const bid = businessId(req);
    const uid = userId(req);
    if (!bid || !uid) {
      return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
    }

    // access-control.routes already runs ensureTenantSystemRoles before this
    // handler. This transaction is therefore read-only: preparing the same role
    // catalogue a second time here created competing role-update transactions.
    const data = await prisma.$transaction(async (tx) => {
      const access = await requireAccessAdministrator(tx, req, bid);
      const [roles, users] = await Promise.all([
        tx.role.findMany({ where: { businessId: bid }, orderBy: [{ isSystemRole: "desc" }, { name: "asc" }] }),
        tx.user.findMany({
          where: { businessId: bid },
          orderBy: { name: "asc" },
          include: { userRoles: { include: { role: true } } },
        }),
      ]);

      return {
        currentUser: {
          id: access.userId,
          name: access.userName,
          isOwner: access.isOwner,
          isAdmin: access.isAdmin,
        },
        permissionDefinitions: permissionDefinitions.map(([key, label, group]) => ({ key, label, group })),
        roles: roles.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          isSystemRole: Boolean(role.isSystemRole),
          permissions: Array.isArray(role.permissions) ? role.permissions : [],
          protected: String(role.name || "").toLowerCase().includes("owner"),
        })),
        users: users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          status: user.status,
          branchId: user.branchId,
          roleIds: user.userRoles.map((entry) => entry.roleId),
          roles: user.userRoles.map((entry) => ({ id: entry.role.id, name: entry.role.name })),
        })),
      };
    });

    return res.json({ ok: true, data });
  } catch (error: any) {
    console.error("getAccessControlV2 error:", error);
    const status = isPermissionDenied(error) ? 403 : 500;
    const message = status === 403 ? error?.message : "Unable to load access control";
    return res.status(status).json({ ok: false, error: { message } });
  }
}

export async function updateRolePermissionsV2(req: Request, res: Response) {
  try {
    const bid = businessId(req);
    const roleId = text(req.params.roleId);
    if (!bid || !roleId) {
      return res.status(400).json({ ok: false, error: { message: "Business and role are required" } });
    }
    if (!Array.isArray(req.body?.permissions)) {
      return res.status(400).json({ ok: false, error: { message: "permissions must be an array" } });
    }

    const allowed = new Set<string>(permissionDefinitions.map(([key]) => key));
    const permissions: string[] = [
      ...new Set<string>(
        req.body.permissions
          .map((item: unknown) => String(item || "").trim())
          .filter((item: string) => allowed.has(item) || item === "*"),
      ),
    ];

    const role = await prisma.$transaction(async (tx) => {
      const access = await requireAccessAdministrator(tx, req, bid);
      const current = await tx.role.findFirst({ where: { id: roleId, businessId: bid } });
      if (!current) throw new Error("Role not found");

      const isOwnerRole = String(current.name || "").toLowerCase().includes("owner");
      if (isOwnerRole && !access.isOwner) throw new Error("Only an Owner can change the Owner role");
      if (permissions.includes("*") && !(access.isOwner || access.isAdmin)) {
        throw new Error("Only an Owner or Admin can grant full access");
      }

      const before = { permissions: Array.isArray(current.permissions) ? current.permissions : [] };
      const updated = await tx.role.update({ where: { id: current.id }, data: { permissions } });
      await writeAudit(tx, req, {
        businessId: bid,
        userId: access.userId,
        action: "ROLE_PERMISSIONS_UPDATED",
        entityType: "role",
        entityId: current.id,
        before,
        after: { permissions },
      });
      return updated;
    });

    return res.json({
      ok: true,
      message: "Role permissions updated",
      data: { id: role.id, name: role.name, permissions: role.permissions },
    });
  } catch (error: any) {
    console.error("updateRolePermissionsV2 error:", error);
    return res.status(403).json({ ok: false, error: { message: error?.message || "Unable to update role permissions" } });
  }
}
