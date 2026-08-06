import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof SharedBackendError) {
    return NextResponse.json(
      { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { error: "BACKEND_UNAVAILABLE", message: "Goods receipt request could not be completed." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  try {
    const payload = await sharedBackendRequest<unknown>("/api/v1/purchases/goods-receipts", {
      token,
      businessId
    });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const purchaseId = String(input?.purchaseOrderId ?? input?.purchaseId ?? "").trim();
  if (!purchaseId) return NextResponse.json({ error: "PURCHASE_ORDER_REQUIRED" }, { status: 400 });
  const headers = new Headers();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  try {
    const payload = await sharedBackendRequest<unknown>(
      `/api/v1/purchases/${encodeURIComponent(purchaseId)}/receive`,
      {
        method: "POST",
        token,
        businessId,
        headers,
        body: {
          warehouseId: input?.warehouseId,
          receiptNo: input?.receiptNo,
          notes: input?.notes,
          lines: input?.lines
        }
      }
    );
    return NextResponse.json(payload, {
      status: 201,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
