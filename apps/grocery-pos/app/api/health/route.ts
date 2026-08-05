import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      product: "AXTOR Grocery POS Cloud",
      version: "0.1.0",
      environment: process.env.GROCERY_ENVIRONMENT ?? "unknown",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
      deployment: process.env.VERCEL_DEPLOYMENT_ID ?? "unknown",
      timestamp: new Date().toISOString()
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
