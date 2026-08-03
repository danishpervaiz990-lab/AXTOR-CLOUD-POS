import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { shouldUpgradeLegacySystemRolePermissions, systemRoleDefinitions } from "./system-role-definitions.js";

const legacyAliasRoles = new Set(["Salesman", "Warehouse"]);

export async function ensureSystemRoles(tx: any, businessId: string): Promise<void> {
  for (const definition of systemRoleDefinitions) {
    const current = await tx.role.findUnique({
      where: { businessId_name: { businessId, name: definition.name } },
    });

    if (!current) {
      if (legacyAliasRoles.has(definition.name)) continue;
      await tx.role.create({
        data: {
          businessId,
          name: definition.name,
          description: definition.description,
          permissions: [...definition.permissions],
          isSystemRole: true,
        },
      });
      continue;
    }

    const upgradePermissions = shouldUpgradeLegacySystemRolePermissions(current.name, current.permissions);
    await tx.role.update({
      where: { id: current.id },
      data: {
        isSystemRole: true,
        description: definition.description,
        ...(upgradePermissions ? { permissions: [...definition.permissions] } : {}),
      },
    });
  }
}

export async function ensureTenantSystemRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  const businessId = req.tenant?.businessId;
  if (!businessId) {
    res.status(401).json({ ok: false, error: { message: "Authentication required" } });
    return;
  }

  try {
    await prisma.$transaction((tx) => ensureSystemRoles(tx, businessId));
    next();
  } catch (error) {
    console.error("ensureTenantSystemRoles error:", error);
    res.status(500).json({ ok: false, error: { message: "Unable to prepare role catalogue" } });
  }
}
