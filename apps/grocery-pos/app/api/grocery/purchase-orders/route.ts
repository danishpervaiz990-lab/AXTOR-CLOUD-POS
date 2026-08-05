import { NextResponse } from "next/server";
import { z } from "zod";
import { createPurchaseOrder } from "@/server/purchasing/create-purchase-order";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decimal = z.union([z.string(), z.number()]).transform(String);
const schema = z.object({
  branchId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  supplierId: z.string().uuid(),
  expectedAt: z.string().datetime().transform((value) => new Date(value)).nullable().optional(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    quantity: decimal,
    unitCost: decimal
  })).min(1).max(500)
});

export async function POST(request: Request) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const context = await requireTenantContext();
    const result = await createPurchaseOrder({ context, ...parsed.data });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "RESOURCE_NOT_FOUND" ? 404
      : ["INVALID_PURCHASE_ORDER_LINES", "INVALID_PURCHASE_QUANTITY", "INVALID_PURCHASE_COST"].includes(code) ? 422
      : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
