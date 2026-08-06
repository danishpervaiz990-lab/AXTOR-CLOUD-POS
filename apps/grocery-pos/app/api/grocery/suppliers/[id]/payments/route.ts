import { PaymentMethodType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { postPartyPayment } from "@/server/finance/post-party-payment";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  branchId: z.string().uuid(),
  accountId: z.string().uuid(),
  methodType: z.nativeEnum(PaymentMethodType),
  amount: z.union([z.string(), z.number()]).transform(String),
  reference: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional()
});

export async function POST(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  try {
    const context = await requireTenantContext();
    const { id } = await routeContext.params;
    const data = await postPartyPayment({
      context,
      idempotencyKey,
      type: "SUPPLIER_PAYMENT",
      partyId: id,
      ...parsed.data
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "RESOURCE_NOT_FOUND" ? 404
      : ["IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST", "REQUEST_ALREADY_IN_PROGRESS"].includes(code) ? 409
      : ["INVALID_IDEMPOTENCY_KEY", "INVALID_PAYMENT_AMOUNT", "DEDICATED_PAYMENT_WORKFLOW_REQUIRED", "PAYMENT_ACCOUNT_METHOD_MISMATCH"].includes(code) ? 422
      : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
