import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/lib/shared-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await revokeCurrentSession();
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
