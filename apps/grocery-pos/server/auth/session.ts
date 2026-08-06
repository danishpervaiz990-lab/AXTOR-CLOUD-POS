import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { getDatabase } from "@/lib/db";
import { getServerEnvironment } from "@/lib/env";

const SESSION_COOKIE = "axtorGrocerySession";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

const sessionClaimsSchema = z.object({
  sid: z.string().uuid(),
  sub: z.string().uuid(),
  businessId: z.string().uuid(),
  role: z.enum([
    "OWNER",
    "ADMINISTRATOR",
    "MANAGER",
    "CASHIER",
    "INVENTORY_MANAGER",
    "ACCOUNTANT",
    "SALESPERSON",
    "VIEWER_AUDITOR"
  ])
});

export type AuthenticatedSession = {
  sessionId: string;
  userId: string;
  businessId: string;
  role: z.infer<typeof sessionClaimsSchema>["role"];
  displayName: string;
  email: string;
  expiresAt: Date;
};

function signingKey(): Uint8Array {
  return new TextEncoder().encode(getServerEnvironment().GROCERY_SESSION_SECRET);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueSession(input: {
  userId: string;
  businessId: string;
  role: AuthenticatedSession["role"];
  ipHash?: string;
  userAgent?: string;
}): Promise<void> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
  const token = await new SignJWT({
    sid: sessionId,
    businessId: input.businessId,
    role: input.role
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setJti(randomUUID())
    .sign(signingKey());

  await getDatabase().session.create({
    data: {
      id: sessionId,
      businessId: input.businessId,
      userId: input.userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipHash: input.ipHash,
      userAgent: input.userAgent?.slice(0, 500)
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: getServerEnvironment().GROCERY_ENVIRONMENT !== "development",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS
  });
}

export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, signingKey(), {
      algorithms: ["HS256"]
    });
    const claims = sessionClaimsSchema.parse({
      sid: verified.payload.sid,
      sub: verified.payload.sub,
      businessId: verified.payload.businessId,
      role: verified.payload.role
    });

    const session = await getDatabase().session.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        businessId: claims.businessId,
        tokenHash: hashToken(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: {
          businessId: claims.businessId,
          status: "ACTIVE"
        }
      },
      include: { user: true }
    });

    if (!session || session.user.role !== claims.role) {
      return null;
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      businessId: session.businessId,
      role: session.user.role,
      displayName: session.user.displayName,
      email: session.user.email,
      expiresAt: session.expiresAt
    };
  } catch {
    return null;
  }
}

export async function requireAuthenticatedSession(): Promise<AuthenticatedSession> {
  const session = await getAuthenticatedSession();
  if (!session) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }
  return session;
}

export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      const verified = await jwtVerify(token, signingKey(), { algorithms: ["HS256"] });
      const sessionId = z.string().uuid().parse(verified.payload.sid);
      await getDatabase().session.updateMany({
        where: { id: sessionId, tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() }
      });
    } catch {
      // Clearing an invalid or expired cookie is still the correct logout behavior.
    }
  }

  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: getServerEnvironment().GROCERY_ENVIRONMENT !== "development",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
}
