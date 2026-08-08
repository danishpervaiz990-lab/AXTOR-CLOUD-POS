import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { findSystemRoleDefinition, shouldUpgradeLegacySystemRolePermissions, systemRoleDefinitions } from "./system-role-definitions.js";

const legacyAliasRoles = new Set(["Salesman", "Warehouse"]);
const canonicalRoleRenames = new Map([["salesman", "Salesperson"], ["warehouse", "Storekeeper"]]);
const DEADLOCK_RETRIES = 2;

function roleFamily(name: unknown): string {
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

function isCanonicalExactMatch(roleName: unknown, canonicalName: string): boolean {
  return String(roleName || "").trim().toLowerCase() === canonicalName.toLowerCase();
}

function permissionsEqual(left: unknown, right: readonly string[]): boolean {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  const a = [...left].map(String).sort();
  const b = [...right].map(String).sort();
  return a.every((value, index) => value === b[index]);
}

function isDeadlockError(error: unknown): boolean {
  const anyError = error as any;
  const message = String(anyError?.message || anyError || "");
  const code = String(anyError?.code || anyError?.meta?.code || "");
  return code === "40P01" || /40P01|deadlock detected/i.test(message);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureSystemRoles(tx: any, businessId: string): Promise<void> {
  // Stable order matters if two first-use transactions touch legacy roles together.
  const existingRoles = await tx.role.findMany({ where: { businessId }, orderBy: { name: "asc" } });

  for (const current of existingRoles) {
    const definition = findSystemRoleDefinition(current.name);
    if (!definition) continue;

    const upgradePermissions = shouldUpgradeLegacySystemRolePermissions(current.name, current.permissions);
    const canonicalRename = canonicalRoleRenames.get(String(current.name || "").trim().toLowerCase());
    const canonicalAlreadyExists = canonicalRename
      ? existingRoles.some((role: any) => role.id !== current.id && isCanonicalExactMatch(role.name, canonicalRename))
      : false;
    const nextName = canonicalRename && upgradePermissions && !canonicalAlreadyExists ? canonicalRename : current.name;

    const needsUpdate =
      String(current.name || "") !== String(nextName || "") ||
      current.isSystemRole !== true ||
      String(current.description || "") !== String(definition.description || "") ||
      (upgradePermissions && !permissionsEqual(current.permissions, definition.permissions));

    if (!needsUpdate) continue;

    const updated = await tx.role.update({
      where: { id: current.id },
      data: {
        name: nextName,
        isSystemRole: true,
        description: definition.description,
        ...(upgradePermissions ? { permissions: [...definition.permissions] } : {}),
      },
    });
    current.name = updated.name;
    current.permissions = updated.permissions;
    current.description = updated.description;
    current.isSystemRole = updated.isSystemRole;
  }

  for (const definition of systemRoleDefinitions) {
    if (legacyAliasRoles.has(definition.name)) continue;
    const family = roleFamily(definition.name);
    const exactCanonicalRequired = ["Salesperson", "Storekeeper", "Purchase Manager", "Warehouse Manager"].includes(definition.name);
    const equivalent = existingRoles.some((role: any) => exactCanonicalRequired
      ? isCanonicalExactMatch(role.name, definition.name)
      : roleFamily(role.name) === family);
    if (equivalent) continue;

    const created = await tx.role.upsert({
      where: { businessId_name: { businessId, name: definition.name } },
      create: {
        businessId,
        name: definition.name,
        description: definition.description,
        permissions: [...definition.permissions],
        isSystemRole: true,
      },
      update: { isSystemRole: true, description: definition.description },
    });
    existingRoles.push(created);
  }
}

async function ensureTenantSystemRolesWithRetry(businessId: string): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      await prisma.$transaction((tx) => ensureSystemRoles(tx, businessId));
      return;
    } catch (error) {
      if (!isDeadlockError(error) || attempt >= DEADLOCK_RETRIES) throw error;
      attempt += 1;
      await sleep(20 * attempt);
    }
  }
}

export async function ensureTenantSystemRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  const businessId = req.tenant?.businessId;
  if (!businessId) {
    res.status(401).json({ ok: false, error: { message: "Authentication required" } });
    return;
  }
  try {
    await ensureTenantSystemRolesWithRetry(businessId);
    next();
  } catch (error) {
    console.error("ensureTenantSystemRoles error:", error);
    res.status(500).json({ ok: false, error: { message: "Unable to prepare role catalogue" } });
  }
}
