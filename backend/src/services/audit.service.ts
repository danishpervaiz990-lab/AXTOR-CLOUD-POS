import type { Request } from "express";
import { requestIp } from "./access.service.js";

export async function writeAudit(
  tx: any,
  req: Request,
  input: {
    businessId: string;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      businessId: input.businessId,
      userId: input.userId || null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId || null,
      before: input.before === undefined ? undefined : (input.before as any),
      after: input.after === undefined ? undefined : (input.after as any),
      ipAddress: requestIp(req),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || null,
    },
  });
}
