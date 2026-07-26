import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";

function configuredEmails(): Set<string> {
  return new Set(String(process.env.PLATFORM_ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean));
}

export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const businessId = req.tenant?.businessId;
    const userId = req.tenant?.userId;
    if (!businessId || !userId) { res.status(401).json({ ok: false, error: { message: "Platform authentication required" } }); return; }
    const allowlist = configuredEmails();
    if (!allowlist.size) { res.status(503).json({ ok: false, error: { message: "Platform administration is not configured" } }); return; }
    const user = await prisma.user.findFirst({ where: { id: userId, businessId, status: "ACTIVE" }, select: { email: true } });
    if (!user || !allowlist.has(user.email.toLowerCase())) { res.status(403).json({ ok: false, error: { message: "Platform administrator access required" } }); return; }
    next();
  } catch {
    res.status(500).json({ ok: false, error: { message: "Unable to verify platform administrator" } });
  }
}
