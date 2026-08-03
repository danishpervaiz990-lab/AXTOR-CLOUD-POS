import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";

function deny(res: Response, permissions: readonly string[]) {
  return res.status(403).json({
    ok: false,
    error: {
      code: "PERMISSION_DENIED",
      message: "You do not have permission to perform this action",
      details: { anyOf: permissions },
    },
  });
}

export function requireAnyPermission(...permissions: string[]) {
  const required = permissions.map((value) => String(value || "").trim()).filter(Boolean);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const businessId = req.tenant?.businessId;
    const userId = req.tenant?.userId;
    if (!businessId || !userId) {
      res.status(401).json({ ok: false, error: { code: "USER_CONTEXT_REQUIRED", message: "Authenticated user is required" } });
      return;
    }

    try {
      const access = await loadUserAccess(prisma, businessId, userId);
      if (!required.some((permission) => hasPermission(access, permission))) {
        deny(res, required);
        return;
      }
      res.locals.userAccess = access;
      next();
    } catch (error) {
      console.error("Permission check failed:", error);
      res.status(403).json({ ok: false, error: { code: "PERMISSION_DENIED", message: "Permission check failed" } });
    }
  };
}

export function requirePermission(permission: string) {
  return requireAnyPermission(permission);
}
