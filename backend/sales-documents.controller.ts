import type { NextFunction, Request, Response } from "express";
import { loadUserAccess, hasPermission } from "../services/access.service.js";
import { prisma } from "../db/prisma.js";

/**
 * API-side permission guard. UI visibility is only a convenience; every
 * sensitive route must also use this middleware or perform the same service
 * check inside its transaction.
 */
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = req.tenant?.businessId;
      const userId = req.tenant?.userId;
      if (!businessId || !userId) {
        res.status(401).json({ ok: false, error: { message: "Authentication required" } });
        return;
      }
      const access = await loadUserAccess(prisma, businessId, userId);
      if (!hasPermission(access, permission)) {
        res.status(403).json({ ok: false, error: { message: `Permission denied: ${permission}`, details: { permission } } });
        return;
      }
      next();
    } catch (error: any) {
      res.status(403).json({ ok: false, error: { message: error?.message || "Permission denied" } });
    }
  };
}
