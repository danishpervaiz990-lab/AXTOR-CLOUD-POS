import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { createRequestFingerprint } from "../services/idempotency.service.js";

function readKey(req: Request): string | null {
  const value = req.header("Idempotency-Key") || req.header("X-Idempotency-Key") || req.body?.idempotencyKey;
  const key = String(value || "").trim();
  return key || null;
}

export function requirePersistentIdempotency(action: string) {
  return async function persistentIdempotency(req: Request, res: Response, next: NextFunction): Promise<void> {
    const businessId = req.tenant?.businessId;
    const userId = req.tenant?.userId;
    const key = readKey(req);

    if (!businessId || !userId) {
      res.status(401).json({ ok: false, error: { message: "Authenticated tenant context is required" } });
      return;
    }
    if (!key) {
      res.status(400).json({ ok: false, error: { code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key is required for this transaction" } });
      return;
    }
    if (key.length > 200) {
      res.status(400).json({ ok: false, error: { code: "IDEMPOTENCY_KEY_INVALID", message: "Idempotency-Key is too long" } });
      return;
    }

    const fingerprint = createRequestFingerprint({ method: req.method, path: req.baseUrl + req.path, body: req.body ?? null });
    const existing = await (prisma as any).idempotencyRecord.findUnique({
      where: { businessId_userId_action_idempotencyKey: { businessId, userId, action, idempotencyKey: key } },
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        res.status(409).json({ ok: false, error: { code: "IDEMPOTENCY_KEY_REUSED", message: "This Idempotency-Key was already used with a different request" } });
        return;
      }
      if (existing.status === "COMPLETED" && existing.resultJson) {
        res.setHeader("Idempotent-Replayed", "true");
        res.status(200).json(existing.resultJson);
        return;
      }
      res.status(409).json({ ok: false, error: { code: "IDEMPOTENCY_IN_PROGRESS", message: "A matching transaction is already in progress" } });
      return;
    }

    try {
      await (prisma as any).idempotencyRecord.create({
        data: { businessId, userId, action, idempotencyKey: key, requestFingerprint: fingerprint, status: "IN_PROGRESS" },
      });
    } catch {
      res.status(409).json({ ok: false, error: { code: "IDEMPOTENCY_IN_PROGRESS", message: "A matching transaction is already in progress" } });
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      const success = res.statusCode >= 200 && res.statusCode < 300;
      const operation = success
        ? (prisma as any).idempotencyRecord.update({
            where: { businessId_userId_action_idempotencyKey: { businessId, userId, action, idempotencyKey: key } },
            data: { status: "COMPLETED", resultJson: body, completedAt: new Date() },
          })
        : (prisma as any).idempotencyRecord.deleteMany({ where: { businessId, userId, action, idempotencyKey: key, status: "IN_PROGRESS" } });
      void operation.catch((error: unknown) => console.error("Idempotency persistence failed:", error));
      return originalJson(body);
    }) as Response["json"];

    next();
  };
}
