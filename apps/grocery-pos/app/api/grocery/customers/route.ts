import { AuditAction, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { assertNonNegativeMoney } from "@/lib/money";
import { requirePermission } from "@/server/permissions/permissions";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const moneyString = z.union([z.string(), z.number()]).transform((value, context) => {
  try { return assertNonNegativeMoney(String(value)).toFixed(4); } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid money amount" });
    return z.NEVER;
  }
});

const createSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  creditEnabled: z.boolean().default(false),
  creditLimit: moneyString.default("0"),
  creditHold: z.boolean().default(false)
}).superRefine((value, context) => {
  if (!value.creditEnabled && value.creditLimit !== "0.0000") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["creditLimit"], message: "Credit limit requires credit to be enabled" });
  }
});

const querySchema = z.object({
  q: z.string().trim().max(120).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  activeOnly: z.enum(["true", "false"]).default("true")
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });

  try {
    const context = await requireTenantContext();
    requirePermission(context, "customers.view");
    const { q, page, pageSize, activeOnly } = parsed.data;
    const where: Prisma.CustomerWhereInput = {
      businessId: context.businessId,
      ...(activeOnly === "true" ? { active: true } : {}),
      ...(q ? { OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { email: { contains: q, mode: "insensitive" } }
      ] } : {})
    };
    const database = getDatabase();
    const [total, rows] = await database.$transaction([
      database.customer.count({ where }),
      database.customer.findMany({
        where,
        orderBy: [{ name: "asc" }, { code: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    return NextResponse.json({
      data: rows.map((customer) => ({
        id: customer.id,
        code: customer.code,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        creditEnabled: customer.creditEnabled,
        creditLimit: customer.creditLimit.toFixed(4),
        creditHold: customer.creditHold,
        active: customer.active
      })),
      pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED" ? code : "INTERNAL_ERROR" }, {
      status: code === "AUTHENTICATION_REQUIRED" ? 401 : code === "PERMISSION_DENIED" ? 403 : 500
    });
  }
}

export async function POST(request: Request) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });

  try {
    const context = await requireTenantContext();
    requirePermission(context, "customers.manage");
    const customer = await getDatabase().$transaction(async (transaction) => {
      const created = await transaction.customer.create({
        data: { businessId: context.businessId, ...parsed.data }
      });
      await transaction.auditLog.create({
        data: {
          businessId: context.businessId,
          actorUserId: context.userId,
          action: AuditAction.CREATE,
          entityType: "CUSTOMER",
          entityId: created.id,
          afterData: {
            code: created.code,
            name: created.name,
            creditEnabled: created.creditEnabled,
            creditLimit: created.creditLimit.toFixed(4)
          }
        }
      });
      return created;
    });
    return NextResponse.json({ data: {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      creditEnabled: customer.creditEnabled,
      creditLimit: customer.creditLimit.toFixed(4),
      creditHold: customer.creditHold,
      active: customer.active
    } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "CUSTOMER_CODE_ALREADY_EXISTS" }, { status: 409 });
    }
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED" ? code : "INTERNAL_ERROR" }, {
      status: code === "AUTHENTICATION_REQUIRED" ? 401 : code === "PERMISSION_DENIED" ? 403 : 500
    });
  }
}
