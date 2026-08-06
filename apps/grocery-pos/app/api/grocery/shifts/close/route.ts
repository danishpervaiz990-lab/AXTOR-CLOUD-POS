import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";
import { getRequestSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { token, businessId } = await getRequestSharedBackendCredentials(request);
  if (!token) return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  const shiftId = String(input?.shiftId ?? "").trim();
  if (!shiftId) return NextResponse.json({ error: "SHIFT_ID_REQUIRED" }, { status: 400 });

  try {
    const payload = await sharedBackendRequest<unknown>(
      `/api/v1/shifts/${encodeURIComponent(shiftId)}/close`,
      {
        method: "POST",
        token,
        businessId,
        body: {
          closingCash: input?.actualCash ?? input?.closingCash,
          notes: input?.notes
        }
      }
    );
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "BACKEND_UNAVAILABLE", message: "Cashier shift could not be closed." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
