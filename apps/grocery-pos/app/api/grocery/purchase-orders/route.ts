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
    { error: "BACKEND_UNAVAILABLE", message: "Purchase order request could not be completed." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  try {
    const source = new URL(request.url);
    const payload = await sharedBackendRequest<unknown>(
      `/api/v1/purchases${source.search}`,
      { token, businessId }
    );
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const headers = new Headers();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  try {
    const lines = Array.isArray(input.lines) ? input.lines : Array.isArray(input.items) ? input.items : [];
    const payload = await sharedBackendRequest<unknown>("/api/v1/purchases", {
      method: "POST",
      token,
      businessId,
      headers,
      body: {
        ...input,
        items: lines.map((line: Record<string, unknown>) => ({
          productId: line.productId,
          sku: line.sku,
          barcode: line.barcode,
          name: line.name ?? line.productName,
          quantity: line.quantity ?? line.qty,
          unitCost: line.unitCost ?? line.cost ?? line.rate
        })),
        status: input.status ?? "DRAFT"
      }
    });
    return NextResponse.json(payload, {
      status: 201,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
