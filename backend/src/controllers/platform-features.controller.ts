import type { Request, Response } from "express";
import { handleError, tenant } from "../utils/http.js";
import * as service from "../services/platform-features.service.js";

export async function capabilityStatus(req: Request, res: Response) {
  try {
    const context = tenant(req);
    return res.json({ ok: true, data: await service.getCapabilityStatus(context.businessId) });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function auditLogs(req: Request, res: Response) {
  try {
    const context = tenant(req);
    const limit = Number(req.query.limit || 100);
    return res.json({ ok: true, data: await service.listAuditLogs(context.businessId, Number.isFinite(limit) ? limit : 100) });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createAuditLog(req: Request, res: Response) {
  try {
    const context = tenant(req);
    const action = String(req.body?.action || "").trim();
    if (!action) return res.status(400).json({ ok: false, error: { message: "action is required" } });
    const data = await service.writeAuditLog({
      businessId: context.businessId,
      userId: context.userId,
      action,
      entityType: req.body?.entityType ? String(req.body.entityType) : undefined,
      entityId: req.body?.entityId ? String(req.body.entityId) : undefined,
      before: req.body?.before,
      after: req.body?.after,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}
