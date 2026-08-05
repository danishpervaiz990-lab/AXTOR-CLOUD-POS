import { NextResponse } from "next/server";
import { z } from "zod";
import { getLedgerStatement } from "@/server/finance/ledger-statement";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().datetime().transform((value) => new Date(value)).optional(),
  to: z.string().datetime().transform((value) => new Date(value)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100)
});

export async function GET(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
  try {
    const context = await requireTenantContext();
    const { id } = await routeContext.params;
    const data = await getLedgerStatement(context, { party: "CUSTOMER", partyId: id, ...parsed.data });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "RESOURCE_NOT_FOUND" ? 404
      : code === "INVALID_DATE_RANGE" ? 422
      : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
