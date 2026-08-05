import { NextResponse } from "next/server";
import { z } from "zod";
import { getInventoryReport } from "@/server/inventory/inventory-report";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  warehouseId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  lowStockOnly: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(250).default(50)
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_QUERY", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const context = await requireTenantContext();
    const data = await getInventoryReport(context, parsed.data);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "RESOURCE_NOT_FOUND" ? 404
      : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
