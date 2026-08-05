import bcrypt from "bcryptjs";
import { AuditAction, UserStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { issueSession, type AuthenticatedSession } from "@/server/auth/session";
import { assertTrustedMutationOrigin } from "@/server/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  workspace: z.string().trim().min(2).max(80).transform((value) => value.toLowerCase()),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200)
});

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function invalidCredentials() {
  return NextResponse.json(
    { error: "INVALID_CREDENTIALS", message: "Workspace, email or password is incorrect." },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
  } catch {
    return NextResponse.json({ error: "UNTRUSTED_ORIGIN" }, { status: 403 });
  }

  let input: z.infer<typeof loginSchema>;
  try {
    input = loginSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const database = getDatabase();
  const user = await database.user.findFirst({
    where: {
      email: input.email,
      business: {
        slug: input.workspace,
        active: true
      }
    },
    include: { business: true }
  });

  if (!user || user.status === UserStatus.DISABLED) {
    await bcrypt.compare(input.password, "$2b$12$zj.JHg8MpwNX4xk9AjlIbeAJjDlbvQtc3VqMR7aAKsBQQ3xPcjLiS");
    return invalidCredentials();
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    return NextResponse.json(
      { error: "ACCOUNT_TEMPORARILY_LOCKED", message: "Sign-in is temporarily unavailable for this account." },
      { status: 423, headers: { "Cache-Control": "no-store" } }
    );
  }

  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordValid) {
    const failedLoginCount = user.failedLoginCount + 1;
    await database.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        lockedUntil: failedLoginCount >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_DURATION_MS) : null,
        status: failedLoginCount >= MAX_FAILED_LOGINS ? UserStatus.LOCKED : user.status
      }
    });
    return invalidCredentials();
  }

  await database.$transaction([
    database.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        status: UserStatus.ACTIVE,
        lastLoginAt: now
      }
    }),
    database.auditLog.create({
      data: {
        businessId: user.businessId,
        actorUserId: user.id,
        action: AuditAction.LOGIN,
        entityType: "USER_SESSION",
        entityId: user.id,
        metadata: { workspace: user.business.slug }
      }
    })
  ]);

  await issueSession({
    userId: user.id,
    businessId: user.businessId,
    role: user.role as AuthenticatedSession["role"],
    userAgent: request.headers.get("user-agent") ?? undefined
  });

  return NextResponse.json(
    {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role
      },
      business: {
        id: user.business.id,
        name: user.business.name,
        slug: user.business.slug,
        currencyCode: user.business.currencyCode,
        timezone: user.business.timezone
      }
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
