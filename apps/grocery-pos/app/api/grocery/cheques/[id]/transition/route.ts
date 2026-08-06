import { NextResponse } from "next/server";
import { z } from "zod";
import { CHEQUE_STATUSES } from "@/server/finance/cheque-status";
import { transitionCheque } from "@/server/finance/transition-cheque";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  toStatus: z.enum(CHEQUE_STATUSES),
  reason: z.string().trim().min(3).max(500).optional(),
  occurredAt: z.string().datetime().transform((value) => new Date(value)).optional()
});

const clientErrors = new Set([
  "Cheque is already in the requested status",
  "CONCURRENT_MODIFICATION",
  "PERMISSION_DENIED",
  "RESOURCE_NOT_FOUND"
]);

export async function POST(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  try {
    const context = await requireTenantContext();
    const { id } = await routeContext.params;
    const cheque = await transitionCheque({ context, chequeId: id, ...parsed.data });
    return NextResponse.json({ data: {
      id: cheque.id,
      direction: cheque.direction,
      status: cheque.status,
      chequeNumber: cheque.chequeNumber,
      amount: cheque.amount.toFixed(4),
      currencyCode: cheque.currencyCode,
      dueDate: cheque.dueDate.toISOString(),
      depositDate: cheque.depositDate?.toISOString() ?? null,
      clearingDate: cheque.clearingDate?.toISOString() ?? null,
      bounceOrReturnDate: cheque.bounceOrReturnDate?.toISOString() ?? null,
      cancellationDate: cheque.cancellationDate?.toISOString() ?? null
    } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const invalidTransition = code.startsWith("Invalid cheque transition:");
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "RESOURCE_NOT_FOUND" ? 404
      : code === "CONCURRENT_MODIFICATION" ? 409
      : invalidTransition || clientErrors.has(code) ? 422
      : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
