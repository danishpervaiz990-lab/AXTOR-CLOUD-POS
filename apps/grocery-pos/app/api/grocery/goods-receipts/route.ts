import { NextResponse } from "next/server";
import { z } from "zod";
import { postGoodsReceipt } from "@/server/purchasing/post-goods-receipt";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  purchaseOrderId: z.string().uuid(),
  lines: z.array(z.object({
    purchaseOrderItemId: z.string().uuid(),
    quantity: z.union([z.string(), z.number()]).transform(String),
    batchNumber: z.string().trim().max(100).nullable().optional(),
    manufactureDate: z.string().datetime().transform((value) => new Date(value)).nullable().optional(),
    expiryDate: z.string().datetime().transform((value) => new Date(value)).nullable().optional()
  })).min(1).max(500)
});

const clientErrors = new Set([
  "INVALID_IDEMPOTENCY_KEY",
  "INVALID_RECEIPT_LINES",
  "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST",
  "REQUEST_ALREADY_IN_PROGRESS",
  "PURCHASE_ORDER_NOT_RECEIVABLE",
  "DUPLICATE_RECEIPT_LINE",
  "RESOURCE_NOT_FOUND",
  "INVALID_RECEIPT_QUANTITY",
  "RECEIPT_EXCEEDS_ORDERED_QUANTITY",
  "BATCH_REQUIRED",
  "EXPIRY_DATE_REQUIRED",
  "INVALID_EXPIRY_DATE",
  "BATCH_DATE_MISMATCH",
  "CONCURRENT_PURCHASE_RECEIPT",
  "PERMISSION_DENIED"
]);

export async function POST(request: Request) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const context = await requireTenantContext();
    const result = await postGoodsReceipt({ context, idempotencyKey, ...parsed.data });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
    if (code === "PERMISSION_DENIED") return NextResponse.json({ error: code }, { status: 403 });
    if (code === "RESOURCE_NOT_FOUND" || code === "PURCHASE_ORDER_NOT_RECEIVABLE") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (clientErrors.has(code)) {
      const status = code.startsWith("CONCURRENT_") || code.startsWith("IDEMPOTENCY_") || code === "REQUEST_ALREADY_IN_PROGRESS"
        ? 409
        : 422;
      return NextResponse.json({ error: code }, { status });
    }
    console.error("Goods receipt posting failed", { code });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
