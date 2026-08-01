import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";

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
      const allowed = access.isOwner || access.isAdmin || required.some((permission) => hasPermission(access, permission));
      if (!allowed) {
        res.status(403).json({
          ok: false,
          error: {
            code: "PERMISSION_DENIED",
            message: "Permission denied",
            details: { anyOf: required },
          },
        });
        return;
      }
      next();
    } catch (error) {
      console.error("Permission check failed:", error);
      res.status(403).json({ ok: false, error: { code: "PERMISSION_DENIED", message: "Permission check failed" } });
    }
  };
}
