import { ChequeDirection, ChequeStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getChequeReport } from "@/server/finance/cheque-report";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  fromDueDate: z.string().datetime().transform((value) => new Date(value)).optional(),
  toDueDate: z.string().datetime().transform((value) => new Date(value)).optional(),
  direction: z.nativeEnum(ChequeDirection).optional(),
  statuses: z.string().optional().transform((value, context) => {
    if (!value) return undefined;
    const parsed = z.array(z.nativeEnum(ChequeStatus)).safeParse(value.split(",").filter(Boolean));
    if (!parsed.success) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid cheque status filter" });
      return z.NEVER;
    }
    return parsed.data;
  }),
  branchId: z.string().uuid().optional(),
  paymentAccountId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100)
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_QUERY", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const context = await requireTenantContext();
    const report = await getChequeReport(context, parsed.data);
    return NextResponse.json({ data: report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (code === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: code }, { status: 401 });
    if (code === "PERMISSION_DENIED") return NextResponse.json({ error: code }, { status: 403 });
    if (code === "INVALID_DATE_RANGE") return NextResponse.json({ error: code }, { status: 422 });
    console.error("Cheque report failed", { code });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
