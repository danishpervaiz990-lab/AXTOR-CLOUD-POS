import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";
import { writeAudit } from "../services/audit.service.js";
import { hashPassword } from "../utils/password.js";
import { assertUsageLimit } from "../services/entitlements.service.js";

const permissionDefinitions = [
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
  ["payments.create", "Receive customer payments", "Payments"],
  ["settings.manage_permissions", "Manage users and role permissions", "Administration"],
] as const;

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

async function requireAccessAdministrator(tx: any, req: Request, bid: string) {
  const access = await loadUserAccess(tx, bid, userId(req));
  if (!(access.isOwner || access.isAdmin || hasPermission(access, "settings.manage_permissions"))) {
    throw new Error("Permission denied: settings.manage_permissions");
  }
  return access;
}

const defaultRoles = [
  { name: "Admin", description: "Full operational access for a trusted administrator", permissions: ["*"] },
  { name: "Manager", description: "Manage daily sales, customers, stock and reports", permissions: ["sales_documents.view", "sales_documents.create", "sales_documents.save_draft", "sales_documents.post", "sales_documents.change_document_type", "sales_documents.change_salesperson", "sales_documents.edit_draft", "sales_documents.edit_posted", "sales_documents.return", "sales_documents.refund", "payments.create"] },
  { name: "Cashier", description: "Create and post counter sales and receive payments", permissions: ["sales_documents.view", "sales_documents.create", "sales_documents.save_draft", "sales_documents.post", "payments.create"] },
  { name: "Salesman", description: "Create and manage assigned sales documents", permissions: ["sales_documents.view", "sales_documents.create", "sales_documents.save_draft", "sales_documents.post"] },
  { name: "Warehouse", description: "Stock and fulfilment team access", permissions: ["sales_documents.view"] },
];

async function ensureDefaultRoles(tx: any, bid: string) {
  for (const role of defaultRoles) {
    await tx.role.upsert({
      where: { businessId_name: { businessId: bid, name: role.name } },
      create: { businessId: bid, ...role, isSystemRole: true },
      update: { isSystemRole: true, description: role.description },
    });
  }
}

function validatePassword(password: string) {
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export async function getAccessControl(req: Request, res: Response) {
  try {
    const bid = businessId(req);
    if (!bid) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });

    const data = await (prisma as any).$transaction(async (tx: any) => {
      const access = await requireAccessAdministrator(tx, req, bid);
      await ensureDefaultRoles(tx, bid);
      const [roles, users] = await Promise.all([
        tx.role.findMany({ where: { businessId: bid }, orderBy: [{ isSystemRole: "desc" }, { name: "asc" }] }),
        tx.user.findMany({
          where: { businessId: bid },
          orderBy: { name: "asc" },
          include: { userRoles: { include: { role: true } } },
        }),
      ]);

      return {
        currentUser: { id: access.userId, name: access.userName, isOwner: access.isOwner, isAdmin: access.isAdmin },
        permissionDefinitions: permissionDefinitions.map(([key, label, group]) => ({ key, label, group })),
        roles: roles.map((role: any) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          isSystemRole: Boolean(role.isSystemRole),
          permissions: Array.isArray(role.permissions) ? role.permissions : [],
          protected: String(role.name || "").toLowerCase().includes("owner"),
        })),
        users: users.map((user: any) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          status: user.status,
          branchId: user.branchId,
          roleIds: (user.userRoles || []).map((entry: any) => entry.roleId),
          roles: (user.userRoles || []).map((entry: any) => ({ id: entry.role.id, name: entry.role.name })),
        })),
      };
    });

    return res.json({ ok: true, data });
  } catch (error: any) {
    console.error("getAccessControl error:", error);
    return res.status(403).json({ ok: false, error: { message: error?.message || "Unable to load access control" } });
  }
}

export async function createUser(req: Request, res: Response) {
  try {
    const bid = businessId(req);
    const name = text(req.body?.name);
    const email = text(req.body?.email)?.toLowerCase();
    const password = String(req.body?.password || "");
    const phone = text(req.body?.phone);
    const branchId = text(req.body?.branchId);
    const requestedRoleIds = Array.isArray(req.body?.roleIds) ? req.body.roleIds : [];
    if (!bid || !name || !email || !password) return res.status(400).json({ ok: false, error: { message: "Name, email and password are required" } });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ ok: false, error: { message: "Enter a valid email address" } });
    if (!validatePassword(password)) return res.status(400).json({ ok: false, error: { message: "Password must be at least 12 characters with uppercase, lowercase, number, and symbol" } });

    const result = await (prisma as any).$transaction(async (tx: any) => {
      const access = await requireAccessAdministrator(tx, req, bid);
      await ensureDefaultRoles(tx, bid);
      await assertUsageLimit(tx, bid, "users");
      if (branchId) {
        const branch = await tx.branch.findFirst({ where: { id: branchId, businessId: bid, active: true } });
        if (!branch) throw new Error("Selected branch is invalid or inactive");
      }
      const roleIds = [...new Set(requestedRoleIds.map((item: unknown) => String(item || "").trim()).filter(Boolean))];
      const roles = roleIds.length ? await tx.role.findMany({ where: { businessId: bid, id: { in: roleIds } } }) : [await tx.role.findFirstOrThrow({ where: { businessId: bid, name: "Cashier" } })];
      if (roles.length !== (roleIds.length || 1)) throw new Error("One or more selected roles are invalid");
      if (roles.some((role: any) => String(role.name).toLowerCase().includes("owner")) && !access.isOwner) throw new Error("Only an Owner can assign an Owner role");
      const duplicate = await tx.user.findFirst({ where: { businessId: bid, email } });
      if (duplicate) throw new Error("A user with this email already exists");
      const user = await tx.user.create({ data: { businessId: bid, branchId: branchId || null, name, email, phone: phone || null, passwordHash: hashPassword(password), status: "ACTIVE", mustChangePassword: true } });
      await tx.userRole.createMany({ data: roles.map((role: any) => ({ businessId: bid, userId: user.id, roleId: role.id })), skipDuplicates: true });
      await writeAudit(tx, req, { businessId: bid, userId: access.userId, action: "USER_CREATED", entityType: "user", entityId: user.id, after: { name, email, branchId: branchId || null, roleIds: roles.map((role: any) => role.id) } });
      return { id: user.id, name: user.name, email: user.email, status: user.status, roleIds: roles.map((role: any) => role.id) };
    });
    return res.status(201).json({ ok: true, message: "User created. They can sign in with the temporary password.", data: result });
  } catch (error: any) {
    console.error("createUser error:", error);
    return res.status(400).json({ ok: false, error: { message: error?.message || "Unable to create user" } });
  }
}

export async function updateRolePermissions(req: Request, res: Response) {
  try {
    const bid = businessId(req);
    const roleId = text(req.params.roleId);
    if (!bid || !roleId) return res.status(400).json({ ok: false, error: { message: "Business and role are required" } });
    if (!Array.isArray(req.body?.permissions)) return res.status(400).json({ ok: false, error: { message: "permissions must be an array" } });

    const allowed = new Set(permissionDefinitions.map(([key]) => key));
    const permissions = [...new Set(req.body.permissions.map((item: unknown) => String(item || "").trim()).filter((item: string) => allowed.has(item as any) || item === "*"))];

    const role = await (prisma as any).$transaction(async (tx: any) => {
      const access = await requireAccessAdministrator(tx, req, bid);
      const current = await tx.role.findFirst({ where: { id: roleId, businessId: bid } });
      if (!current) throw new Error("Role not found");
      const isOwnerRole = String(current.name || "").toLowerCase().includes("owner");
      if (isOwnerRole && !access.isOwner) throw new Error("Only an Owner can change the Owner role");

      const before = { permissions: current.permissions || [] };
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

    return res.json({ ok: true, message: "Role permissions updated", data: { id: role.id, name: role.name, permissions: role.permissions } });
  } catch (error: any) {
    console.error("updateRolePermissions error:", error);
    return res.status(403).json({ ok: false, error: { message: error?.message || "Unable to update role permissions" } });
  }
}

export async function updateUserRoles(req: Request, res: Response) {
  try {
    const bid = businessId(req);
    const targetUserId = text(req.params.userId);
    if (!bid || !targetUserId) return res.status(400).json({ ok: false, error: { message: "Business and user are required" } });
    const roleIds: string[] = [...new Set<string>((Array.isArray(req.body?.roleIds) ? req.body.roleIds : []).map((item: unknown) => String(item || "").trim()).filter((item: string) => Boolean(item)))];
    if (!roleIds.length) return res.status(400).json({ ok: false, error: { message: "At least one role is required" } });

    const result = await (prisma as any).$transaction(async (tx: any) => {
      const access = await requireAccessAdministrator(tx, req, bid);
      const [target, roles] = await Promise.all([
        tx.user.findFirst({ where: { id: targetUserId, businessId: bid }, include: { userRoles: { include: { role: true } } } }),
        tx.role.findMany({ where: { businessId: bid, id: { in: roleIds } } }),
      ]);
      if (!target) throw new Error("User not found");
      if (roles.length !== roleIds.length) throw new Error("One or more selected roles are invalid");

      const ownerRoleIds = new Set((await tx.role.findMany({ where: { businessId: bid, name: { contains: "owner", mode: "insensitive" } }, select: { id: true } })).map((role: any) => role.id));
      const hadOwnerRole = (target.userRoles || []).some((entry: any) => ownerRoleIds.has(entry.roleId));
      const keepsOwnerRole = roleIds.some((id: string) => ownerRoleIds.has(id));
      if (!hadOwnerRole && keepsOwnerRole && !access.isOwner) {
        throw new Error("Only an Owner can assign an Owner role");
      }
      if (hadOwnerRole && !keepsOwnerRole) {
        if (!access.isOwner) throw new Error("Only an Owner can remove an Owner role");
        const ownerAssignments = await tx.userRole.count({ where: { businessId: bid, roleId: { in: Array.from(ownerRoleIds) } } });
        if (ownerAssignments <= 1) throw new Error("The last Owner role cannot be removed");
      }

      const before = { roleIds: (target.userRoles || []).map((entry: any) => entry.roleId) };
      await tx.userRole.deleteMany({ where: { businessId: bid, userId: target.id } });
      await tx.userRole.createMany({ data: roleIds.map((roleId: string) => ({ businessId: bid, userId: target.id, roleId })), skipDuplicates: true });
      await writeAudit(tx, req, {
        businessId: bid,
        userId: access.userId,
        action: "USER_ROLES_UPDATED",
        entityType: "user",
        entityId: target.id,
        before,
        after: { roleIds },
      });
      return { id: target.id, name: target.name, roleIds, roles: roles.map((role: any) => ({ id: role.id, name: role.name })) };
    });

    return res.json({ ok: true, message: "User roles updated", data: result });
  } catch (error: any) {
    console.error("updateUserRoles error:", error);
    return res.status(403).json({ ok: false, error: { message: error?.message || "Unable to update user roles" } });
  }
}
