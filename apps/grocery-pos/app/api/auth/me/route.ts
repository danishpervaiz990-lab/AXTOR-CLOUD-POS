import { NextResponse } from "next/server";
import { SharedBackendError, groceryApi } from "@/lib/shared-backend";
import { getSharedBackendCredentials } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const credentials = await getSharedBackendCredentials();
  if (!credentials) {
    return NextResponse.json(
      { error: "AUTHENTICATION_REQUIRED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const payload = await groceryApi.get<unknown>(
      "/api/v1/auth/me",
      credentials.token,
      credentials.businessId
    );
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SharedBackendError) {
      return NextResponse.json(
        { error: error.code ?? "AUTHENTICATION_REQUIRED", message: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Session could not be verified." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
