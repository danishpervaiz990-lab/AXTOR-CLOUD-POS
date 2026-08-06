import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReturnEnvelope = {
  data?: { id?: string; total?: string | number };
};

function refundMethod(value: unknown): string {
  const method = String(value ?? "cash").toLowerCase();
  if (method.includes("card")) return "card";
  if (method.includes("bank")) return "bank transfer";
  if (method.includes("wallet")) return "wallet";
  if (method.includes("credit")) return "store credit";
  return "cash";
}

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ id: string }> }
) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const { id } = await routeContext.params;
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const lines = Array.isArray(input.lines) ? input.lines as Array<Record<string, unknown>> : [];
  if (!lines.length) return NextResponse.json({ error: "INVALID_RETURN_LINES" }, { status: 422 });
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || crypto.randomUUID();

  try {
    const returned = await sharedBackendRequest<ReturnEnvelope>("/api/v1/sales-returns", {
      method: "POST",
      token,
      businessId,
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        sourceSalesDocumentId: id,
        idempotencyKey,
        reason: input.reason ?? "Grocery sale return",
        warehouseId: input.warehouseId,
        items: lines.map((line) => ({
          productId: line.productId ?? line.saleItemId,
          sku: line.sku,
          returnQty: line.quantity ?? line.returnQty ?? line.qty,
          soldQty: line.soldQty,
          rate: line.rate ?? line.unitPrice,
          name: line.name,
          reason: line.reason
        }))
      }
    });

    let refund: unknown = null;
    const refundInput = input.refund && typeof input.refund === "object"
      ? input.refund as Record<string, unknown>
      : null;
    const refundAmount = Number(refundInput?.amount ?? 0);
    if (refundInput && refundAmount > 0) {
      refund = await sharedBackendRequest<unknown>("/api/v1/refunds", {
        method: "POST",
        token,
        businessId,
        headers: { "Idempotency-Key": `${idempotencyKey}:refund` },
        body: {
          salesDocumentId: id,
          salesReturnId: returned.data?.id,
          amount: refundAmount,
          method: refundMethod(refundInput.methodType),
          accountId: refundInput.accountId,
          referenceNo: refundInput.reference,
          idempotencyKey: `${idempotencyKey}:refund`
        }
      });
    }

    return NextResponse.json(
      { data: { return: returned.data ?? returned, refund } },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "RETURN_POSTING_FAILED", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "BACKEND_UNAVAILABLE", message: "Sale return could not be completed." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
