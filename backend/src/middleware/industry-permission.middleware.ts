import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireIndustryWritePermission(industryCode: string, ...aliases: string[]) {
  const canonical = String(industryCode).trim().toLowerCase();
  const allowedCodes = [canonical, ...aliases.map((value) => String(value).trim().toLowerCase())];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (READ_METHODS.has(req.method)) {
      next();
      return;
    }

    const businessId = req.tenant?.businessId;
    const userId = req.tenant?.userId;
    if (!businessId || !userId) {
      res.status(401).json({ ok: false, error: { message: "Authenticated user is required" } });
      return;
    }

    try {
      const access = await loadUserAccess(prisma, businessId, userId);
      const allowed = allowedCodes.some((code) =>
        hasPermission(access, `industry.${code}.*`) ||
        hasPermission(access, `${code}.*`) ||
        hasPermission(access, `industry.${code}.write`)
      );

      if (!allowed) {
        res.status(403).json({
          ok: false,
          error: {
            message: `Permission required for ${canonical} write operations`,
            details: { permission: `industry.${canonical}.*` },
          },
        });
        return;
      }

      next();
    } catch {
      res.status(403).json({ ok: false, error: { message: "Industry permission check failed" } });
    }
  };
}
