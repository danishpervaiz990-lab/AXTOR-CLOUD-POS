import { AuditAction, PurchaseStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, contextInput: { params: Promise<{ id: string }> }) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }

  try {
    const context = await requireTenantContext();
    requirePermission(context, "purchases.approve");
    const { id } = await contextInput.params;
    const database = getDatabase();
    const result = await database.$transaction(async (transaction) => {
      const order = await transaction.purchaseOrder.findFirst({
        where: { id, businessId: context.businessId, status: PurchaseStatus.DRAFT }
      });
      if (!order) throw new Error("RESOURCE_NOT_FOUND");
      const update = await transaction.purchaseOrder.updateMany({
        where: { id: order.id, businessId: context.businessId, status: PurchaseStatus.DRAFT },
        data: { status: PurchaseStatus.APPROVED }
      });
      if (update.count !== 1) throw new Error("CONCURRENT_PURCHASE_ORDER_MODIFICATION");
      await transaction.auditLog.create({
        data: {
          businessId: context.businessId,
          actorUserId: context.userId,
          action: AuditAction.APPROVE,
          entityType: "PURCHASE_ORDER",
          entityId: order.id,
          beforeData: { status: order.status },
          afterData: { status: PurchaseStatus.APPROVED }
        }
      });
      return { id: order.id, orderNumber: order.orderNumber, status: PurchaseStatus.APPROVED };
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "RESOURCE_NOT_FOUND" ? 404
      : code === "CONCURRENT_PURCHASE_ORDER_MODIFICATION" ? 409
      : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
