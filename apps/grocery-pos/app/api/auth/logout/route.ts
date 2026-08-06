import { AuditAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { getAuthenticatedSession, revokeCurrentSession } from "@/server/auth/session";
import { assertTrustedMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
  } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }

  const session = await getAuthenticatedSession();
  if (session) {
    await getDatabase().auditLog.create({
      data: {
        businessId: session.businessId,
        actorUserId: session.userId,
        action: AuditAction.LOGOUT,
        entityType: "USER_SESSION",
        entityId: session.sessionId
      }
    });
  }

  await revokeCurrentSession();
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
