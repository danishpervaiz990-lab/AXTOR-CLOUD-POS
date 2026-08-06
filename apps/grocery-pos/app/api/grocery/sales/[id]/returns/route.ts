import { PaymentMethodType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { processSaleReturn } from "@/server/sales/process-return";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  lines: z.array(z.object({
    saleItemId: z.string().uuid(),
    quantity: z.union([z.string(), z.number()]).transform(String),
    reason: z.string().trim().min(3).max(500)
  })).min(1).max(500),
  refund: z.object({
    accountId: z.string().uuid(),
    methodType: z.nativeEnum(PaymentMethodType),
    amount: z.union([z.string(), z.number()]).transform(String),
    reference: z.string().trim().max(160).nullable().optional()
  }).nullable().optional()
});

const validationCodes = new Set([
  "INVALID_IDEMPOTENCY_KEY",
  "INVALID_RETURN_LINES",
  "DUPLICATE_RETURN_LINE",
  "DEDICATED_REFUND_WORKFLOW_REQUIRED",
  "SALE_NOT_RETURNABLE",
  "INVALID_RETURN_QUANTITY",
  "RETURN_EXCEEDS_AVAILABLE_QUANTITY",
  "RETURN_REASON_REQUIRED",
  "INVALID_REFUND_AMOUNT",
  "REFUND_EXCEEDS_RETURN_VALUE",
  "REFUND_EXCEEDS_NET_PAID",
  "WALK_IN_RETURN_REQUIRES_REFUND"
]);

export async function POST(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });

  try {
    const context = await requireTenantContext();
    const { id } = await routeContext.params;
    const data = await processSaleReturn({ context, idempotencyKey, saleId: id, ...parsed.data });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : ["RESOURCE_NOT_FOUND", "SALE_NOT_RETURNABLE", "PAYMENT_ACCOUNT_NOT_FOUND"].includes(code) ? 404
      : ["IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST", "REQUEST_ALREADY_IN_PROGRESS", "CONCURRENT_SALE_MODIFICATION", "CONCURRENT_INVENTORY_MODIFICATION"].includes(code) ? 409
      : validationCodes.has(code) ? 422
      : 500;
    if (status === 500) console.error("Sale return failed", { code });
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
