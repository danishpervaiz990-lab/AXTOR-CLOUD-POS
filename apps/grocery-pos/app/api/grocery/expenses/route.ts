import { PaymentMethodType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { postExpense } from "@/server/finance/post-expense";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  branchId: z.string().uuid(),
  paymentAccountId: z.string().uuid(),
  methodType: z.nativeEnum(PaymentMethodType),
  category: z.string().trim().min(2).max(120),
  description: z.string().trim().min(3).max(1000),
  amount: z.union([z.string(), z.number()]).transform(String),
  taxAmount: z.union([z.string(), z.number()]).transform(String).optional(),
  incurredAt: z.string().datetime().transform((value) => new Date(value)),
  reference: z.string().trim().max(160).nullable().optional()
});

const validationCodes = new Set([
  "INVALID_IDEMPOTENCY_KEY",
  "DEDICATED_PAYMENT_WORKFLOW_REQUIRED",
  "INVALID_EXPENSE_AMOUNT",
  "INVALID_EXPENSE_TAX",
  "EXPENSE_TAX_EXCEEDS_AMOUNT"
]);

export async function POST(request: Request) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });

  try {
    const context = await requireTenantContext();
    const data = await postExpense({ context, idempotencyKey, ...parsed.data });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "RESOURCE_NOT_FOUND" ? 404
      : ["IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST", "REQUEST_ALREADY_IN_PROGRESS"].includes(code) ? 409
      : validationCodes.has(code) ? 422
      : 500;
    if (status === 500) console.error("Expense posting failed", { code });
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
