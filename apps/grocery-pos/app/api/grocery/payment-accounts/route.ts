import { PaymentMethodType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  branchId: z.string().uuid().optional(),
  methodTypes: z.string().optional().transform((value, context) => {
    if (!value) return undefined;
    const parsed = z.array(z.nativeEnum(PaymentMethodType)).safeParse(value.split(",").filter(Boolean));
    if (!parsed.success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid payment method filter" });
      return z.NEVER;
    }
    return parsed.data;
  })
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });

  try {
    const context = await requireTenantContext();
    requirePermission(context, "payment_accounts.view");
    const accounts = await getDatabase().paymentAccount.findMany({
      where: {
        businessId: context.businessId,
        active: true,
        ...(parsed.data.branchId ? { OR: [{ branchId: null }, { branchId: parsed.data.branchId }] } : {}),
        ...(parsed.data.methodTypes?.length ? { methodType: { in: parsed.data.methodTypes } } : {})
      },
      select: {
        id: true,
        branchId: true,
        code: true,
        name: true,
        methodType: true,
        currencyCode: true,
        maskedAccountNumber: true
      },
      orderBy: [{ methodType: "asc" }, { name: "asc" }]
    });
    return NextResponse.json({ data: accounts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED" ? code : "INTERNAL_ERROR" }, {
      status: code === "AUTHENTICATION_REQUIRED" ? 401 : code === "PERMISSION_DENIED" ? 403 : 500
    });
  }
}
