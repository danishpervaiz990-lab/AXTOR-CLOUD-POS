import crypto from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Request } from "express";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { createAuthSession, getCurrentUser } from "./auth.service.js";
import { issueAuthToken } from "../utils/jwt.js";

const HANDOFF_AUDIENCE = "axtor-frontend-handoff";
const HANDOFF_ISSUER = "axtor-pos-cloud";
const HANDOFF_TTL_SECONDS = 120;

type HandoffClaims = JwtPayload & {
  type: "frontend_handoff";
  businessId: string;
  userId: string;
  targetOrigin: string;
};

function hashToken(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requestIp(req: Request): string | null {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  return forwarded || req.ip || req.socket.remoteAddress || null;
}

function normalizeOrigin(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) throw new Error("Target origin is required");
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error("Target origin is invalid");
  }
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("Target origin must use HTTPS");
  }
  const configured = new URL(env.frontendUrl).origin;
  const isVercel = parsed.hostname === "vercel.app" || parsed.hostname.endsWith(".vercel.app");
  const isCustomAxtor = parsed.hostname === "axtorpos.com" || parsed.hostname.endsWith(".axtorpos.com");
  if (!local && parsed.origin !== configured && !isVercel && !isCustomAxtor) {
    throw new Error("Target origin is not an approved Axtor frontend");
  }
  return parsed.origin;
}

function verifyHandoffCode(code: string): HandoffClaims {
  const decoded = jwt.verify(code, env.authTokenSecret, {
    audience: HANDOFF_AUDIENCE,
    issuer: HANDOFF_ISSUER,
  });
  if (typeof decoded === "string") throw new Error("Invalid handoff code");
  const claims = decoded as HandoffClaims;
  if (claims.type !== "frontend_handoff" || !claims.businessId || !claims.userId || !claims.targetOrigin) {
    throw new Error("Invalid handoff code");
  }
  return claims;
}

export async function createFrontendHandoff(input: {
  req: Request;
  businessId: string;
  userId: string;
  targetOrigin: unknown;
}) {
  const targetOrigin = normalizeOrigin(input.targetOrigin);
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000);
  const code = jwt.sign(
    {
      type: "frontend_handoff",
      businessId: input.businessId,
      userId: input.userId,
      targetOrigin,
    },
    env.authTokenSecret,
    {
      audience: HANDOFF_AUDIENCE,
      issuer: HANDOFF_ISSUER,
      subject: input.userId,
      jwtid: crypto.randomUUID(),
      expiresIn: HANDOFF_TTL_SECONDS,
    },
  );

  await prisma.authSession.create({
    data: {
      businessId: input.businessId,
      userId: input.userId,
      tokenHash: hashToken(code),
      expiresAt,
      ipAddress: requestIp(input.req),
      userAgent: `frontend-handoff:${targetOrigin}`.slice(0, 500),
    },
  });

  return { code, targetOrigin, expiresIn: HANDOFF_TTL_SECONDS, expiresAt };
}

export async function exchangeFrontendHandoff(input: {
  req: Request;
  code: unknown;
  targetOrigin?: unknown;
}) {
  const code = String(input.code || "").trim();
  if (!code) throw new Error("Handoff code is required");
  const claims = verifyHandoffCode(code);
  const headerOrigin = String(input.req.headers.origin || "").trim();
  const requestedOrigin = normalizeOrigin(input.targetOrigin || headerOrigin || claims.targetOrigin);
  if (requestedOrigin !== normalizeOrigin(claims.targetOrigin)) throw new Error("Handoff target does not match this frontend");
  if (headerOrigin && normalizeOrigin(headerOrigin) !== requestedOrigin) throw new Error("Handoff origin mismatch");

  const tokenHash = hashToken(code);
  const consumed = await prisma.authSession.updateMany({
    where: {
      tokenHash,
      businessId: claims.businessId,
      userId: claims.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { revokedAt: new Date(), lastSeenAt: new Date() },
  });
  if (consumed.count !== 1) throw new Error("Handoff code is expired or has already been used");

  const session = await createAuthSession({
    businessId: claims.businessId,
    userId: claims.userId,
    ipAddress: requestIp(input.req),
    userAgent: String(input.req.headers["user-agent"] || "").slice(0, 500) || null,
  });
  const token = issueAuthToken({
    businessId: claims.businessId,
    userId: claims.userId,
    sessionId: session.sessionId,
  });
  const current = await getCurrentUser(claims.businessId, claims.userId);
  return {
    token,
    tokenType: "Bearer",
    expiresIn: env.authTokenExpiresIn,
    sessionId: session.sessionId,
    user: current.user,
    business: current.business,
    permissions: current.permissions,
  };
}
