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

  try {
    const payload = await sharedBackendRequest<unknown>("/api/v1/shifts/open", {
      method: "POST",
      token,
      businessId,
      body: {
        branchId: input.branchId,
        counterId: input.registerId ?? input.counterId,
        openingCash: input.openingCash,
        notes: input.notes
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
      { error: "BACKEND_UNAVAILABLE", message: "Cashier shift could not be opened." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
