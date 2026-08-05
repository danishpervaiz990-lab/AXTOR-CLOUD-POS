import { CashMovementType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { addCashMovement } from "@/server/shifts/manage-shift";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  shiftId: z.string().uuid(),
  type: z.nativeEnum(CashMovementType),
  amount: z.union([z.string(), z.number()]).transform(String),
  reason: z.string().trim().min(3).max(500)
});

export async function POST(request: Request) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  try {
    const context = await requireTenantContext();
    const result = await addCashMovement({ context, ...parsed.data });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "OPEN_SHIFT_NOT_FOUND" ? 404
      : ["INVALID_CASH_AMOUNT", "OPENING_MOVEMENT_NOT_ALLOWED"].includes(code) ? 422
      : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
