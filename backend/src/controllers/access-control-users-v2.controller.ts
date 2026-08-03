import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";
import { writeAudit } from "../services/audit.service.js";
import { assertUsageLimit } from "../services/entitlements.service.js";
import { ensureSystemRoles } from "../services/system-roles.service.js";
import { hashPassword } from "../utils/password.js";

function text(value: unknown) {
  const result = String(value ?? "").trim();
  return result || undefined;
}

function validPassword(password: string) {
  return password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

export async function createUserV2(req: Request, res: Response) {
  try {
    const businessId = req.tenant?.businessId;
    const actorUserId = req.tenant?.userId;
    const name = text(req.body?.name);
    const email = text(req.body?.email)?.toLowerCase();
    const password = String(req.body?.password || "");
    const phone = text(req.body?.phone);
    const branchId = text(req.body?.branchId);
    const requestedRoleIds = Array.isArray(req.body?.roleIds) ? req.body.roleIds : [];

    if (!businessId || !actorUserId || !name || !email || !password) {
      return res.status(400).json({ ok: false, error: { message: "Name, email and password are required" } });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ ok: false, error: { message: "Enter a valid email address" } });
    }
    if (!validPassword(password)) {
      return res.status(400).json({ ok: false, error: { message: "Password must be at least 12 characters with uppercase, lowercase, number, and symbol" } });
    }

    const result = await prisma.$transaction(async (tx) => {
      const access = await loadUserAccess(tx, businessId, actorUserId);
      if (!(access.isOwner || access.isAdmin || hasPermission(access, "settings.manage_permissions"))) {
        throw new Error("Permission denied: settings.manage_permissions");
      }

      await ensureSystemRoles(tx, businessId);
      await assertUsageLimit(tx, businessId, "users");

      if (branchId) {
        const branch = await tx.branch.findFirst({ where: { id: branchId, businessId, active: true } });
        if (!branch) throw new Error("Selected branch is invalid or inactive");
      }

      const roleIds: string[] = [
        ...new Set<string>(
          requestedRoleIds
            .map((item: unknown) => String(item || "").trim())
            .filter((item: string) => Boolean(item)),
        ),
      ];
      const roles = roleIds.length
        ? await tx.role.findMany({ where: { businessId, id: { in: roleIds } } })
        : [await tx.role.findFirstOrThrow({ where: { businessId, name: "Cashier" } })];
      if (roles.length !== (roleIds.length || 1)) throw new Error("One or more selected roles are invalid");
      if (roles.some((role) => String(role.name).toLowerCase().includes("owner")) && !access.isOwner) {
        throw new Error("Only an Owner can assign an Owner role");
      }

      const duplicate = await tx.user.findFirst({ where: { businessId, email } });
      if (duplicate) throw new Error("A user with this email already exists");

      const user = await tx.user.create({
        data: {
          businessId,
          branchId: branchId || null,
          name,
          email,
          phone: phone || null,
          passwordHash: hashPassword(password),
          status: "ACTIVE",
          mustChangePassword: true,
        },
      });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ businessId, userId: user.id, roleId: role.id })),
        skipDuplicates: true,
      });
      await writeAudit(tx, req, {
        businessId,
        userId: access.userId,
        action: "USER_CREATED",
        entityType: "user",
        entityId: user.id,
        after: {
          name,
          email,
          branchId: branchId || null,
          roleIds: roles.map((role) => role.id),
        },
      });

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        roleIds: roles.map((role) => role.id),
      };
    });

    return res.status(201).json({
      ok: true,
      message: "User created. They can sign in with the temporary password.",
      data: result,
    });
  } catch (error: any) {
    console.error("createUserV2 error:", error);
    const forbidden = String(error?.message || "").startsWith("Permission denied");
    return res.status(forbidden ? 403 : 400).json({
      ok: false,
      error: { message: error?.message || "Unable to create user" },
    });
  }
}
