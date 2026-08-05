import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/server/auth/session";
import { permissionsForRole } from "@/server/permissions/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  return NextResponse.json(
    {
      user: {
        id: session.userId,
        displayName: session.displayName,
        email: session.email,
        role: session.role
      },
      tenant: {
        businessId: session.businessId
      },
      permissions: permissionsForRole(session.role),
      session: {
        expiresAt: session.expiresAt.toISOString()
      }
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
