import { PaymentDirection, PaymentMethodType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPaymentReconciliation } from "@/server/finance/payment-reconciliation";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().datetime().transform((value) => new Date(value)),
  to: z.string().datetime().transform((value) => new Date(value)),
  branchId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  methodTypes: z.string().optional().transform((value, context) => {
    if (!value) return undefined;
    const values = value.split(",").filter(Boolean);
    const parsed = z.array(z.nativeEnum(PaymentMethodType)).safeParse(values);
    if (!parsed.success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid payment method filter" });
      return z.NEVER;
    }
    return parsed.data;
  }),
  direction: z.nativeEnum(PaymentDirection).optional(),
  includePending: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100)
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_QUERY", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const context = await requireTenantContext();
    const report = await getPaymentReconciliation(context, parsed.data);
    return NextResponse.json({ data: report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
    if (code === "PERMISSION_DENIED") return NextResponse.json({ error: code }, { status: 403 });
    if (code === "INVALID_DATE_RANGE") return NextResponse.json({ error: code }, { status: 422 });
    console.error("Payment reconciliation report failed", { code });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
