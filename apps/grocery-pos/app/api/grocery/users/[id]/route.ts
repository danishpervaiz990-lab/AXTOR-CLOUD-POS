import { AuditAction, RoleKey, UserStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import { assertTrustedMutationOrigin } from "@/server/security/origin";
import { requireTenantContext } from "@/server/tenancy/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  role: z.nativeEnum(RoleKey).optional(),
  status: z.nativeEnum(UserStatus).optional()
}).refine((value) => Object.keys(value).length > 0, { message: "At least one change is required" });

export async function PATCH(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try { assertTrustedMutationOrigin(request); } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST", details: parsed.error.flatten() }, { status: 400 });

  try {
    const context = await requireTenantContext();
    requirePermission(context, "users.manage");
    const { id } = await routeContext.params;
    if (parsed.data.role === RoleKey.OWNER && context.role !== RoleKey.OWNER) {
      return NextResponse.json({ error: "OWNER_ROLE_REQUIRES_OWNER" }, { status: 403 });
    }

    const user = await getDatabase().$transaction(async (transaction) => {
      const existing = await transaction.user.findFirst({
        where: { id, businessId: context.businessId }
      });
      if (!existing) throw new Error("RESOURCE_NOT_FOUND");

      const removingOwner = existing.role === RoleKey.OWNER && (
        (parsed.data.role && parsed.data.role !== RoleKey.OWNER) ||
        (parsed.data.status && parsed.data.status !== UserStatus.ACTIVE)
      );
      if (removingOwner) {
        const activeOwners = await transaction.user.count({
          where: { businessId: context.businessId, role: RoleKey.OWNER, status: UserStatus.ACTIVE }
        });
        if (activeOwners <= 1) throw new Error("LAST_ACTIVE_OWNER_REQUIRED");
      }

      const updated = await transaction.user.update({
        where: { id: existing.id },
        data: parsed.data
      });
      const authorizationChanged = (
        parsed.data.role !== undefined && parsed.data.role !== existing.role
      ) || (
        parsed.data.status !== undefined && parsed.data.status !== existing.status
      );
      if (authorizationChanged) {
        await transaction.userSession.updateMany({
          where: { businessId: context.businessId, userId: existing.id, revokedAt: null },
          data: { revokedAt: new Date() }
        });
      }
      await transaction.auditLog.create({
        data: {
          businessId: context.businessId,
          actorUserId: context.userId,
          action: AuditAction.UPDATE,
          entityType: "USER",
          entityId: existing.id,
          beforeData: {
            displayName: existing.displayName,
            role: existing.role,
            status: existing.status
          },
          afterData: {
            displayName: updated.displayName,
            role: updated.role,
            status: updated.status,
            sessionsRevoked: authorizationChanged
          }
        }
      });
      return updated;
    });

    return NextResponse.json({ data: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      updatedAt: user.updatedAt.toISOString()
    } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "PERMISSION_DENIED" ? 403
      : code === "RESOURCE_NOT_FOUND" ? 404
      : code === "LAST_ACTIVE_OWNER_REQUIRED" ? 409
      : 500;
    return NextResponse.json({ error: status === 500 ? "INTERNAL_ERROR" : code }, { status });
  }
}
