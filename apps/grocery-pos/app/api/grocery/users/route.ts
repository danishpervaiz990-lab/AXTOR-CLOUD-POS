import bcrypt from "bcryptjs";
import { AuditAction, Prisma, RoleKey, UserStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(120).default(""),
  role: z.nativeEnum(RoleKey).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

const createSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(2).max(160),
  password: z.string().min(12).max(200),
  role: z.nativeEnum(RoleKey),
  status: z.nativeEnum(UserStatus).default(UserStatus.ACTIVE)
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
  try {
    const context = await requireTenantContext();
    requirePermission(context, "users.manage");
    const where: Prisma.UserWhereInput = {
      businessId: context.businessId,
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.q ? {
        OR: [
          { email: { contains: parsed.data.q, mode: "insensitive" } },
          { displayName: { contains: parsed.data.q, mode: "insensitive" } }
        ]
      } : {})
    };
    const database = getDatabase();
    const [total, users] = await database.$transaction([
      database.user.count({ where }),
      database.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          lastLoginAt: true,
          lockedUntil: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: [{ displayName: "asc" }, { email: "asc" }],
        skip: (parsed.data.page - 1) * parsed.data.pageSize,
        take: parsed.data.pageSize
      })
    ]);
    return NextResponse.json({
      data: users.map((user) => ({
        ...user,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        lockedUntil: user.lockedUntil?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      })),
      pagination: {
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        total,
        pageCount: Math.ceil(total / parsed.data.pageSize)
      }
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
    requirePermission(context, "users.manage");
    if (parsed.data.role === RoleKey.OWNER && context.role !== RoleKey.OWNER) {
      return NextResponse.json({ error: "OWNER_ROLE_REQUIRES_OWNER" }, { status: 403 });
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await getDatabase().$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          businessId: context.businessId,
          email: parsed.data.email,
          displayName: parsed.data.displayName,
          passwordHash,
          role: parsed.data.role,
          status: parsed.data.status
        }
      });
      await transaction.auditLog.create({
        data: {
          businessId: context.businessId,
          actorUserId: context.userId,
          action: AuditAction.CREATE,
          entityType: "USER",
          entityId: created.id,
          afterData: {
            email: created.email,
            displayName: created.displayName,
            role: created.role,
            status: created.status
          }
        }
      });
      return created;
    });
    return NextResponse.json({ data: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString()
    } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "USER_EMAIL_ALREADY_EXISTS" }, { status: 409 });
    }
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    return NextResponse.json({ error: code === "AUTHENTICATION_REQUIRED" || code === "PERMISSION_DENIED" ? code : "INTERNAL_ERROR" }, {
      status: code === "AUTHENTICATION_REQUIRED" ? 401 : code === "PERMISSION_DENIED" ? 403 : 500
    });
  }
}
