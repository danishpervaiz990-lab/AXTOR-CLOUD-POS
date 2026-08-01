import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { createRequestFingerprint } from "../services/idempotency.service.js";

type StoredRecord = {
  request_fingerprint: string;
  status: "IN_PROGRESS" | "COMPLETED";
  result_json: Prisma.JsonValue | null;
};

function readKey(req: Request): string | null {
  const value = req.header("Idempotency-Key") || req.header("X-Idempotency-Key") || req.body?.idempotencyKey;
  const key = String(value || "").trim();
  return key || null;
}

export function requirePersistentIdempotency(action: string) {
  return async function persistentIdempotency(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
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
      if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) {
        res.status(400).json({ ok: false, error: { code: "IDEMPOTENCY_KEY_INVALID", message: "Idempotency-Key must be 8-200 characters using letters, numbers, dot, underscore, colon or hyphen" } });
        return;
      }

      const fingerprint = createRequestFingerprint({ method: req.method, path: req.baseUrl + req.path, body: req.body ?? null });
      const rows = await prisma.$queryRaw<StoredRecord[]>`
        SELECT "request_fingerprint", "status", "result_json"
        FROM "idempotency_records"
        WHERE "business_id" = ${businessId}
          AND "user_id" = ${userId}
          AND "action" = ${action}
          AND "idempotency_key" = ${key}
        LIMIT 1
      `;
      const existing = rows[0];
      if (existing) {
        if (existing.request_fingerprint !== fingerprint) {
          res.status(409).json({ ok: false, error: { code: "IDEMPOTENCY_KEY_REUSED", message: "This Idempotency-Key was already used with a different request" } });
          return;
        }
        if (existing.status === "COMPLETED" && existing.result_json !== null) {
          res.setHeader("Idempotent-Replayed", "true");
          res.status(200).json(existing.result_json);
          return;
        }
        res.status(409).json({ ok: false, error: { code: "IDEMPOTENCY_IN_PROGRESS", message: "A matching transaction is already in progress" } });
        return;
      }

      const recordId = crypto.randomUUID();
      const inserted = await prisma.$executeRaw`
        INSERT INTO "idempotency_records" (
          "id", "business_id", "user_id", "action", "idempotency_key",
          "request_fingerprint", "status"
        ) VALUES (
          ${recordId}, ${businessId}, ${userId}, ${action}, ${key},
          ${fingerprint}, 'IN_PROGRESS'
        )
        ON CONFLICT ("business_id", "user_id", "action", "idempotency_key") DO NOTHING
      `;
      if (inserted === 0) {
        res.status(409).json({ ok: false, error: { code: "IDEMPOTENCY_IN_PROGRESS", message: "A matching transaction is already in progress" } });
        return;
      }

      const originalJson = res.json.bind(res);
      res.json = ((body: any) => {
        const success = res.statusCode >= 200 && res.statusCode < 300;
        const operation = success
          ? prisma.$executeRaw`
              UPDATE "idempotency_records"
              SET "status" = 'COMPLETED',
                  "result_json" = ${JSON.parse(JSON.stringify(body ?? null)) as Prisma.InputJsonValue},
                  "completed_at" = CURRENT_TIMESTAMP
              WHERE "id" = ${recordId}
            `
          : prisma.$executeRaw`
              DELETE FROM "idempotency_records"
              WHERE "id" = ${recordId} AND "status" = 'IN_PROGRESS'
            `;
        void operation.catch((error: unknown) => console.error("Idempotency persistence failed:", error));
        return originalJson(body);
      }) as Response["json"];

      next();
    } catch (error) {
      next(error);
    }
  };
}
