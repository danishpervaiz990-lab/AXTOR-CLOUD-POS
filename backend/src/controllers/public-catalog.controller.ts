import crypto from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import * as service from "../services/public-catalog.service.js";
import { createAuthToken, hashAuthToken } from "../utils/auth-token.js";
import { verifyPassword } from "../utils/password.js";

function fail(res: Response, error: unknown) {
  if (error instanceof service.PublicCatalogError) {
    res.status(error.status).json({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        referenceId: res.locals.requestId,
      },
    });
    return;
  }
  console.error("Public catalogue request failed:", error);
  res.status(500).json({
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Unable to complete the request",
      referenceId: res.locals.requestId,
    },
  });
}

export async function catalog(_req: Request, res: Response) {
  try { res.json({ ok: true, data: await service.catalogue() }); } catch (error) { fail(res, error); }
}

export async function industry(req: Request, res: Response) {
  try { res.json({ ok: true, data: service.industryDetail(req.params.code) }); } catch (error) { fail(res, error); }
}

async function createProvisionedOwnerSession(req: Request, result: any, password: string) {
  const businessId = String(result?.business?.id || "");
  const businessSlug = String(result?.business?.slug || "").trim().toLowerCase();
  const email = String(result?.owner?.email || "").trim().toLowerCase();
  if (!businessId || !businessSlug || !email || !password) {
    throw new service.PublicCatalogError(500, "SESSION_ESTABLISHMENT_FAILED", "Workspace was created, but its owner session could not be established");
  }

  const user = await prisma.user.findUnique({
    where: { businessId_email: { businessId, email } },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user?.passwordHash || user.status !== "ACTIVE" || !verifyPassword(password, user.passwordHash)) {
    throw new service.PublicCatalogError(401, "OWNER_CREDENTIAL_MISMATCH", "Workspace already exists, but the supplied owner password does not match it. Use the password from the original completed registration.");
  }

  const role = user.userRoles[0]?.role.name || "Owner";
  const sessionId = crypto.randomUUID();
  const token = createAuthToken({ userId: user.id, businessId, businessSlug, email: user.email, role, sessionId });
  const expiresIn = Number(process.env.AUTH_TOKEN_EXPIRES_SECONDS || "86400");
  await prisma.authSession.create({
    data: {
      id: sessionId,
      businessId,
      userId: user.id,
      tokenHash: hashAuthToken(token),
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      ipAddress: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim() || null,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || null,
    },
  });

  return {
    token,
    tokenType: "Bearer",
    expiresIn,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      role,
      roles: user.userRoles.map(item => item.role.name),
      mustChangePassword: user.mustChangePassword,
    },
  };
}

export async function register(req: Request, res: Response) {
  try {
    const result = await service.register(req, req.body || {});
    const auth = await createProvisionedOwnerSession(req, result, String(req.body?.password || ""));
    res.status(201).json({ ok: true, data: { ...result, auth } });
  } catch (error) {
    fail(res, error);
  }
}
