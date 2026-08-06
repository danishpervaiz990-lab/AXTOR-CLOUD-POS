import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const delta = Number(input.quantityDelta ?? input.quantity ?? input.qty);
  if (!Number.isFinite(delta) || delta === 0) {
    return NextResponse.json(
      { error: "INVALID_INVENTORY_QUANTITY", message: "Quantity change must be a non-zero number." },
      { status: 422 }
    );
  }
  const headers = new Headers();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  try {
    const payload = await sharedBackendRequest<unknown>("/api/v1/inventory/adjustments", {
      method: "POST",
      token,
      businessId,
      headers,
      body: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        type: delta < 0 ? "subtract" : "add",
        qty: Math.abs(delta),
        reason: input.reason,
        referenceNo: input.referenceNo
      }
    });
    return NextResponse.json(payload, {
      status: 201,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "BACKEND_UNAVAILABLE", message: "Stock adjustment could not be posted." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
