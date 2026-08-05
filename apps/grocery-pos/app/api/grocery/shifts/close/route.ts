import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { closeCashierShift } from "@/server/shifts/manage-shift";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  shiftId: z.string().uuid(),
  actualCash: z.union([z.string(), z.number()]).transform(String)
});

export async function POST(request: Request) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  try {
    const context = await requireTenantContext();
    const result = await closeCashierShift({ context, ...parsed.data });
    return NextResponse.json({ data: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "OPEN_SHIFT_NOT_FOUND" ? 404
      : code === "CONCURRENT_SHIFT_MODIFICATION" ? 409
      : code === "INVALID_CASH_AMOUNT" ? 422
      : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
