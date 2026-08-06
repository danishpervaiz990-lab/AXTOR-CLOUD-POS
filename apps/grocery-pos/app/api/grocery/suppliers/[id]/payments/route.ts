import { NextResponse } from "next/server";
import {
  SharedBackendError,
  sharedBackendRequest
} from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ id: string }> }
) {
  const { id } = await routeContext.params;
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const headers = new Headers();
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  try {
    const payload = await sharedBackendRequest<unknown>(
      "/api/v1/purchases/supplier-payments",
      {
        method: "POST",
        token,
        businessId,
        headers,
        body: { ...body, supplierId: id }
      }
    );
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
      { error: "BACKEND_UNAVAILABLE", message: "Supplier payment could not be posted." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
