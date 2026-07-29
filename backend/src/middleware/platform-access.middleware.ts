import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";

const RESOURCE_BASE: Record<string, string> = {
  companies: "platform.companies",
  webhooks: "platform.webhooks",
  dashboards: "platform.dashboards",
  "notification-providers": "platform.notifications",
  "offline-policies": "platform.offline",
};

const RESOURCE_FALLBACKS: Record<string, { view: string[]; manage: string[] }> = {
  companies: { view: ["settings.view"], manage: ["settings.manage"] },
  webhooks: { view: ["settings.view"], manage: ["settings.manage"] },
  dashboards: { view: ["reports.view", "reports.*"], manage: ["reports.manage", "reports.*"] },
  "notification-providers": { view: ["settings.view"], manage: ["settings.manage"] },
  "offline-policies": { view: ["settings.view"], manage: ["settings.manage"] },
};

export function requirePlatformResourcePermission(action: "view" | "manage") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const businessId = req.tenant?.businessId;
    const userId = req.tenant?.userId;
    const resource = String(req.params.resource || "").trim();
    const base = RESOURCE_BASE[resource];

    if (!businessId || !userId) {
      res.status(401).json({ ok: false, error: { message: "Authenticated user is required" } });
      return;
    }

    if (!base) {
      res.status(400).json({ ok: false, error: { message: "Unsupported platform resource" } });
      return;
    }

    try {
      const access = await loadUserAccess(prisma, businessId, userId);
      const required = [
        `${base}.${action}`,
        `${base}.*`,
        `platform.${action}`,
        "platform.*",
        ...(RESOURCE_FALLBACKS[resource]?.[action] || []),
      ];
      const allowed = access.isOwner || access.isAdmin || required.some((permission) => hasPermission(access, permission));

      if (!allowed) {
        res.status(403).json({
          ok: false,
          error: {
            message: "Permission denied",
            details: { resource, action, anyOf: required },
          },
        });
        return;
      }

      next();
    } catch {
      res.status(403).json({ ok: false, error: { message: "Permission check failed" } });
    }
  };
}
