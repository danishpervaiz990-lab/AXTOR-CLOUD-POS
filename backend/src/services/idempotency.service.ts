import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

export type IdempotencyScope = {
  businessId: string;
  userId: string;
  action: string;
  key: string;
  payload: unknown;
  expiresAt?: Date | null;
};

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_KEY_REUSED";
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyInProgressError extends Error {
  readonly code = "IDEMPOTENCY_REQUEST_IN_PROGRESS";
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyInProgressError";
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function createRequestFingerprint(payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableValue(payload ?? null)))
    .digest("hex");
}

function validateScope(scope: IdempotencyScope): void {
  if (!scope.businessId.trim()) throw new Error("businessId is required for idempotent writes");
  if (!scope.userId.trim()) throw new Error("userId is required for idempotent writes");
  if (!scope.action.trim()) throw new Error("action is required for idempotent writes");
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(scope.key)) {
    throw new Error("Idempotency key must be 8-200 characters using letters, numbers, dot, underscore, colon or hyphen");
  }
}

type StoredRecord = {
  request_fingerprint: string;
  status: "IN_PROGRESS" | "COMPLETED";
  result_json: Prisma.JsonValue | null;
};

export type IdempotentResult<T> = {
  value: T;
  replayed: boolean;
};

/**
 * Executes a tenant-scoped write exactly once.
 *
 * The idempotency row and the business operation share one PostgreSQL transaction.
 * If the operation fails, the claim is rolled back and can be retried safely.
 */
export async function executeIdempotent<T>(
  prisma: PrismaClient,
  scope: IdempotencyScope,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  resultReference?: (value: T) => string | null | undefined,
): Promise<IdempotentResult<T>> {
  validateScope(scope);
  const fingerprint = createRequestFingerprint(scope.payload);

  return prisma.$transaction(
    async (tx) => {
      const recordId = crypto.randomUUID();
      const inserted = await tx.$executeRaw`
        INSERT INTO "idempotency_records" (
          "id", "business_id", "user_id", "action", "idempotency_key",
          "request_fingerprint", "status", "expires_at"
        ) VALUES (
          ${recordId}, ${scope.businessId}, ${scope.userId}, ${scope.action}, ${scope.key},
          ${fingerprint}, 'IN_PROGRESS', ${scope.expiresAt ?? null}
        )
        ON CONFLICT ("business_id", "user_id", "action", "idempotency_key") DO NOTHING
      `;

      if (inserted === 0) {
        const rows = await tx.$queryRaw<StoredRecord[]>`
          SELECT "request_fingerprint", "status", "result_json"
          FROM "idempotency_records"
          WHERE "business_id" = ${scope.businessId}
            AND "user_id" = ${scope.userId}
            AND "action" = ${scope.action}
            AND "idempotency_key" = ${scope.key}
          FOR UPDATE
        `;
        const existing = rows[0];
        if (!existing) throw new Error("Idempotency record disappeared during transaction");
        if (existing.request_fingerprint !== fingerprint) {
          throw new IdempotencyConflictError("The idempotency key was already used with a different request payload");
        }
        if (existing.status === "COMPLETED") {
          return { value: existing.result_json as T, replayed: true };
        }
        throw new IdempotencyInProgressError("A request with this idempotency key is already in progress");
      }

      const value = await operation(tx);
      const jsonResult = JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
      await tx.$executeRaw`
        UPDATE "idempotency_records"
        SET "status" = 'COMPLETED',
            "result_json" = ${jsonResult},
            "result_reference" = ${resultReference?.(value) ?? null},
            "completed_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${recordId}
      `;
      return { value, replayed: false };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 },
  );
}
