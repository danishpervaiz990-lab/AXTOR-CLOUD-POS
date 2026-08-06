import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();

  try {
    await getDatabase().$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        latencyMs: Math.round(performance.now() - startedAt),
        timestamp: new Date().toISOString()
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch {
    return NextResponse.json(
      {
        status: "error",
        database: "unavailable",
        timestamp: new Date().toISOString()
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}
