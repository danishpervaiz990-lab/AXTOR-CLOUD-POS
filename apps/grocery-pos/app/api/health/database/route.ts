import { NextResponse } from "next/server";
import { SharedBackendError, sharedBackendRequest } from "@/lib/shared-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();

  try {
    const payload = await sharedBackendRequest<unknown>("/api/v1/health/db");
    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        sharedBackend: payload,
        latencyMs: Math.round(performance.now() - startedAt),
        timestamp: new Date().toISOString()
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    const status = error instanceof SharedBackendError ? error.status : 503;
    return NextResponse.json(
      {
        status: "error",
        database: "unavailable",
        sharedBackendStatus: status,
        message: error instanceof Error ? error.message : "Shared backend database is unavailable.",
        timestamp: new Date().toISOString()
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}
