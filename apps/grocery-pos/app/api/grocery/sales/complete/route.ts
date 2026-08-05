import { PaymentMethodType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { completeSale } from "@/server/sales/complete-sale";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decimal = z.union([z.string(), z.number()]).transform((value) => String(value));
const optionalDate = z.string().datetime().transform((value) => new Date(value)).nullable().optional();

const checkoutSchema = z.object({
  branchId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  registerId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  dueAt: optionalDate,
  items: z.array(z.object({
    productId: z.string().uuid(),
    batchId: z.string().uuid().nullable().optional(),
    quantity: decimal,
    unitPrice: decimal.nullable().optional(),
    discountAmount: decimal.nullable().optional()
  })).min(1).max(500),
  payments: z.array(z.object({
    accountId: z.string().uuid(),
    methodType: z.nativeEnum(PaymentMethodType),
    amount: decimal,
    reference: z.string().trim().max(160).nullable().optional(),
    cheque: z.object({
      chequeNumber: z.string().trim().min(1).max(80),
      bankName: z.string().trim().min(1).max(160),
      bankBranch: z.string().trim().max(160).nullable().optional(),
      maskedAccount: z.string().trim().max(40).nullable().optional(),
      drawerOrIssuer: z.string().trim().max(200).nullable().optional(),
      chequeDate: z.string().datetime().transform((value) => new Date(value)),
      dueDate: z.string().datetime().transform((value) => new Date(value))
    }).nullable().optional()
  })).max(20)
});

const safeClientErrors = new Set([
  "INVALID_IDEMPOTENCY_KEY",
  "INVALID_SALE_ITEMS",
  "TOO_MANY_PAYMENT_COMPONENTS",
  "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST",
  "REQUEST_ALREADY_IN_PROGRESS",
  "RESOURCE_NOT_FOUND",
  "OPEN_CASHIER_SHIFT_REQUIRED",
  "INVALID_SALE_QUANTITY",
  "INVALID_SALE_AMOUNT",
  "PRICE_OVERRIDE_NOT_ALLOWED",
  "DISCOUNT_NOT_ALLOWED",
  "DISCOUNT_EXCEEDS_LINE_VALUE",
  "PAYMENT_ACCOUNT_NOT_FOUND",
  "PAYMENT_ACCOUNT_METHOD_MISMATCH",
  "INVALID_PAYMENT_AMOUNT",
  "CHEQUE_DETAILS_REQUIRED",
  "CHEQUE_DETAILS_NOT_ALLOWED",
  "PAYMENT_COMPONENTS_EXCEED_SALE_TOTAL",
  "CUSTOMER_REQUIRED_FOR_PARTIAL_OR_CREDIT_SALE",
  "DUE_DATE_REQUIRED",
  "CUSTOMER_CREDIT_NOT_AVAILABLE",
  "CUSTOMER_CREDIT_LIMIT_EXCEEDED",
  "BATCH_REQUIRED",
  "INSUFFICIENT_STOCK",
  "INSUFFICIENT_BATCH_STOCK",
  "CONCURRENT_INVENTORY_MODIFICATION",
  "PERMISSION_DENIED"
]);

function statusForError(code: string): number {
  if (code === "RESOURCE_NOT_FOUND" || code === "PAYMENT_ACCOUNT_NOT_FOUND") return 404;
  if (code === "PERMISSION_DENIED") return 403;
  if (code === "REQUEST_ALREADY_IN_PROGRESS" || code.startsWith("CONCURRENT_")) return 409;
  if (code === "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST") return 409;
  return 422;
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
  } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_REQUEST", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const context = await requireTenantContext();
    const result = await completeSale({
      context,
      idempotencyKey,
      ...parsed.data
    });
    return NextResponse.json({ data: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (code === "AUTHENTICATION_REQUIRED") {
      return NextResponse.json({ error: code }, { status: 401 });
    }
    if (safeClientErrors.has(code)) {
      return NextResponse.json({ error: code }, { status: statusForError(code) });
    }
    console.error("Grocery sale completion failed", { code });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
