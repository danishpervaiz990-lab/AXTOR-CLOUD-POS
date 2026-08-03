import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import {
  findSystemRoleDefinition,
  shouldUpgradeLegacySystemRolePermissions,
  systemRoleDefinitions,
} from "./system-role-definitions.js";

const legacyAliasRoles = new Set(["Salesman", "Warehouse"]);

function roleFamily(name: unknown): string {
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

export async function ensureSystemRoles(tx: any, businessId: string): Promise<void> {
  const existingRoles = await tx.role.findMany({ where: { businessId } });

  for (const current of existingRoles) {
    const definition = findSystemRoleDefinition(current.name);
    if (!definition) continue;
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

  for (const definition of systemRoleDefinitions) {
    if (legacyAliasRoles.has(definition.name)) continue;
    const family = roleFamily(definition.name);
    const equivalent = existingRoles.some((role: any) => roleFamily(role.name) === family);
    if (equivalent) continue;

    const created = await tx.role.create({
      data: {
        businessId,
        name: definition.name,
        description: definition.description,
        permissions: [...definition.permissions],
        isSystemRole: true,
      },
    });
    existingRoles.push(created);
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
