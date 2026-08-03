import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";
import { permissionDefinitions } from "../services/system-role-definitions.js";
import { ensureSystemRoles } from "../services/system-roles.service.js";

export async function getAccessControlV2(req: Request, res: Response) {
  try {
    const businessId = req.tenant?.businessId;
    const userId = req.tenant?.userId;
    if (!businessId || !userId) {
      return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
    }

    const data = await prisma.$transaction(async (tx) => {
      const access = await loadUserAccess(tx, businessId, userId);
      if (!(access.isOwner || access.isAdmin || hasPermission(access, "settings.manage_permissions"))) {
        throw new Error("Permission denied: settings.manage_permissions");
      }

      await ensureSystemRoles(tx, businessId);
      const [roles, users] = await Promise.all([
        tx.role.findMany({ where: { businessId }, orderBy: [{ isSystemRole: "desc" }, { name: "asc" }] }),
        tx.user.findMany({
          where: { businessId },
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
    return res.status(403).json({ ok: false, error: { message: error?.message || "Unable to load access control" } });
  }
}
