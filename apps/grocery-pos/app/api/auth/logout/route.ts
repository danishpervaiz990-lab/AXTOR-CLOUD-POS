import { NextResponse } from "next/server";
import { SharedBackendError, groceryApi } from "@/lib/shared-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const businessId = request.headers.get("x-business-id") ?? undefined;

  if (!token) {
    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const payload = await groceryApi.post<unknown>(
      "/api/v1/auth/logout",
      {},
      token,
      businessId
    );
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SharedBackendError && (error.status === 404 || error.status === 405)) {
      return NextResponse.json(
        { status: "ok" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "SHARED_BACKEND_ERROR", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Logout could not be completed." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
