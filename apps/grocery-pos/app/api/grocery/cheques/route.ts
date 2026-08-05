import { ChequeDirection } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createCheque } from "@/server/finance/create-cheque";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  direction: z.nativeEnum(ChequeDirection),
  branchId: z.string().uuid().nullable().optional(),
  paymentAccountId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  chequeNumber: z.string().trim().min(1).max(80),
  bankName: z.string().trim().min(1).max(160),
  bankBranch: z.string().trim().max(160).nullable().optional(),
  maskedAccount: z.string().trim().max(40).nullable().optional(),
  drawerOrIssuer: z.string().trim().max(200).nullable().optional(),
  payeeOrBeneficiary: z.string().trim().max(200).nullable().optional(),
  amount: z.union([z.string(), z.number()]).transform(String),
  chequeDate: z.string().datetime().transform((value) => new Date(value)),
  dueDate: z.string().datetime().transform((value) => new Date(value)),
  notes: z.string().trim().max(1000).nullable().optional(),
  allocations: z.array(z.object({
    referenceType: z.string().trim().min(1).max(80),
    referenceId: z.string().trim().min(1).max(120),
    amount: z.union([z.string(), z.number()]).transform(String)
  })).max(100).optional()
});

const validationCodes = new Set([
  "INVALID_IDEMPOTENCY_KEY",
  "INWARD_CHEQUE_CANNOT_USE_SUPPLIER",
  "OUTWARD_CHEQUE_CANNOT_USE_CUSTOMER",
  "INVALID_CHEQUE_AMOUNT",
  "TOO_MANY_CHEQUE_ALLOCATIONS",
  "CHEQUE_OVER_ALLOCATED",
  "DUPLICATE_CHEQUE_ALLOCATION"
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
    const data = await createCheque({ context, idempotencyKey, ...parsed.data });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "RESOURCE_NOT_FOUND" ? 404
      : ["IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST", "REQUEST_ALREADY_IN_PROGRESS"].includes(code) ? 409
      : validationCodes.has(code) ? 422
      : 500;
    if (status === 500) console.error("Cheque creation failed", { code });
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
