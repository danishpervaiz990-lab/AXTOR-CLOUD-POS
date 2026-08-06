import { NextResponse } from "next/server";
import { z } from "zod";
import { adjustStock } from "@/server/inventory/adjust-stock";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  branchId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  batchId: z.string().uuid().nullable().optional(),
  quantityDelta: z.union([z.string(), z.number()]).transform(String),
  reason: z.string().trim().min(3).max(500)
});

export async function POST(request: Request) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  try {
    const context = await requireTenantContext();
    const data = await adjustStock({ context, idempotencyKey, ...parsed.data });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "RESOURCE_NOT_FOUND" ? 404
      : ["IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST", "REQUEST_ALREADY_IN_PROGRESS", "CONCURRENT_INVENTORY_MODIFICATION"].includes(code) ? 409
      : ["INVALID_IDEMPOTENCY_KEY", "INVALID_INVENTORY_QUANTITY", "ADJUSTMENT_REASON_REQUIRED", "BATCH_REQUIRED", "INSUFFICIENT_STOCK", "INSUFFICIENT_BATCH_STOCK"].includes(code) ? 422
      : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
