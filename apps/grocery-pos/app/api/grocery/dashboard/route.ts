import { NextResponse } from "next/server";
import { z } from "zod";
import { getGroceryDashboard } from "@/server/dashboard/get-dashboard";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ branchId: z.string().uuid().optional() });

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
  try {
    const context = await requireTenantContext();
    const data = await getGroceryDashboard(context, parsed.data.branchId);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" || code === "WORKSPACE_DISABLED" ? 403
      : code === "RESOURCE_NOT_FOUND" ? 404
      : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
