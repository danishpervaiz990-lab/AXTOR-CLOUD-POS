import { cookies } from "next/headers";
import {
  SharedBackendError,
  sharedBackendRequest
} from "@/lib/shared-backend";

const TOKEN_COOKIE = "axtorGroceryAuthToken";
const BUSINESS_COOKIE = "axtorGroceryBusinessId";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export type GroceryRole =
  | "OWNER"
  | "ADMINISTRATOR"
  | "MANAGER"
  | "CASHIER"
  | "INVENTORY_MANAGER"
  | "ACCOUNTANT"
  | "SALESPERSON"
  | "VIEWER_AUDITOR";

export type AuthenticatedSession = {
  sessionId: string;
  userId: string;
  businessId: string;
  role: GroceryRole;
  displayName: string;
  email: string;
  expiresAt: Date;
};

type SharedMePayload = {
  ok?: boolean;
  business?: {
    id?: string;
    slug?: string;
    name?: string;
  };
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    roles?: string[];
  };
};

function normalizeRole(value: unknown): GroceryRole {
  const role = String(value ?? "").trim().toLowerCase();
  if (role.includes("owner")) return "OWNER";
  if (role.includes("administrator") || role === "admin") return "ADMINISTRATOR";
  if (role.includes("inventory")) return "INVENTORY_MANAGER";
  if (role.includes("account")) return "ACCOUNTANT";
  if (role.includes("sales")) return "SALESPERSON";
  if (role.includes("cashier")) return "CASHIER";
  if (role.includes("manager")) return "MANAGER";
  return "VIEWER_AUDITOR";
}

function tokenMetadata(token: string): { sessionId: string; expiresAt: Date } {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) throw new Error("Missing JWT payload");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      sessionId?: string;
      sid?: string;
      exp?: number;
    };
    return {
      sessionId: String(payload.sessionId ?? payload.sid ?? "shared-backend-session"),
      expiresAt: payload.exp
        ? new Date(payload.exp * 1000)
        : new Date(Date.now() + SESSION_DURATION_SECONDS * 1000)
    };
  } catch {
    return {
      sessionId: "shared-backend-session",
      expiresAt: new Date(Date.now() + SESSION_DURATION_SECONDS * 1000)
    };
  }
}

function secureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function setSharedBackendSession(input: {
  token: string;
  businessId: string;
  expiresIn?: number;
}) {
  const maxAge = Number.isFinite(input.expiresIn)
    ? Math.max(60, Math.trunc(input.expiresIn ?? SESSION_DURATION_SECONDS))
    : SESSION_DURATION_SECONDS;
  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
  cookieStore.set(TOKEN_COOKIE, input.token, options);
  cookieStore.set(BUSINESS_COOKIE, input.businessId, options);
}

export async function getSharedBackendCredentials(): Promise<{
  token: string;
  businessId?: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  return {
    token,
    businessId: cookieStore.get(BUSINESS_COOKIE)?.value
  };
}

export async function clearSharedBackendSession() {
  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0
  };
  cookieStore.set(TOKEN_COOKIE, "", options);
  cookieStore.set(BUSINESS_COOKIE, "", options);
}

export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const credentials = await getSharedBackendCredentials();
  if (!credentials) return null;

  try {
    const payload = await sharedBackendRequest<SharedMePayload>("/api/v1/auth/me", {
      token: credentials.token,
      businessId: credentials.businessId
    });
    const user = payload.user;
    const business = payload.business;
    if (!user?.id || !user.email || !business?.id) return null;
    const metadata = tokenMetadata(credentials.token);
    return {
      sessionId: metadata.sessionId,
      userId: user.id,
      businessId: business.id,
      role: normalizeRole(user.role ?? user.roles?.[0]),
      displayName: user.name ?? user.email,
      email: user.email,
      expiresAt: metadata.expiresAt
    };
  } catch (error) {
    if (error instanceof SharedBackendError && [401, 403].includes(error.status)) {
      return null;
    }
    return null;
  }
}

export async function requireAuthenticatedSession(): Promise<AuthenticatedSession> {
  const session = await getAuthenticatedSession();
  if (!session) throw new Error("AUTHENTICATION_REQUIRED");
  return session;
}

export async function revokeCurrentSession(): Promise<void> {
  const credentials = await getSharedBackendCredentials();
  if (credentials) {
    try {
      await sharedBackendRequest("/api/v1/auth/logout", {
        method: "POST",
        token: credentials.token,
        businessId: credentials.businessId,
        body: {}
      });
    } catch {
      // Local cookie removal remains the correct logout result when the backend is unavailable.
    }
  }
  await clearSharedBackendSession();
}
