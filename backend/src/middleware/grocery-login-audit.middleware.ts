import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { requestIp } from "../services/access.service.js";

function text(v: unknown) { return String(v ?? "").trim(); }

async function groceryBusinessFromRequestOrPayload(req: Request, body: any) {
  const payloadBusinessId = text(body?.business?.id);
  if (payloadBusinessId) {
    const row = await prisma.businessIndustry.findUnique({ where: { businessId: payloadBusinessId }, include: { industry: { select: { code: true } } } });
    return String(row?.industry?.code || "").toLowerCase() === "grocery" ? payloadBusinessId : null;
  }
  const workspace = text(req.body?.businessSlug).toLowerCase();
  if (!workspace || workspace === text(req.body?.email).toLowerCase()) return null;
  const business = await prisma.business.findUnique({ where: { slug: workspace }, include: { businessIndustry: { include: { industry: { select: { code: true } } } } } });
  return String(business?.businessIndustry?.industry?.code || "").toLowerCase() === "grocery" ? business?.id || null : null;
}

export function auditGroceryLogin(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  let sent = false;
  (res as any).json = (body: any) => {
    if (sent) return originalJson(body);
    sent = true;
    void (async () => {
      try {
        const businessId = await groceryBusinessFromRequestOrPayload(req, body);
        if (businessId) {
          const email = text(req.body?.email).toLowerCase();
          const knownUser = body?.user?.id ? { id: body.user.id } : email ? await prisma.user.findFirst({ where: { businessId, email }, select: { id: true } }) : null;
          const success = Boolean(body?.ok && body?.token);
          await prisma.auditLog.create({ data: { businessId, userId: knownUser?.id || null, action: success ? "LOGIN_SUCCESS" : "LOGIN_FAILED", entityType: "authentication", entityId: knownUser?.id || null, after: { workspace: text(req.body?.businessSlug), email, outcome: success ? "success" : "failed", reason: success ? null : text(body?.error?.message) || `HTTP ${res.statusCode}` }, ipAddress: requestIp(req), userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || null } });
        }
      } catch (error) { console.error("Grocery login audit failed:", error); }
      originalJson(body);
    })();
    return res;
  };
  next();
}
