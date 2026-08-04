import crypto from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import * as service from "../services/public-catalog-launch.service.js";
import { collectBusinessInsertCompatibility } from "../services/business-schema-diagnostics.service.js";
import { createAuthToken, hashAuthToken } from "../utils/auth-token.js";
import { verifyPassword } from "../utils/password.js";

type RegistrationStage = "tenant_provisioning" | "owner_session";

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

function prismaErrorCode(error: unknown): string | null {
  const code = String((error as any)?.code || "").trim();
  return /^P\d{4}$/.test(code) ? code : null;
}

function safeErrorType(error: unknown): string {
  const name = String((error as any)?.name || (error as any)?.constructor?.name || "Error").trim();
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ? name : "Error";
}

function safeSourceLocation(error: unknown): string | null {
  const stack = String((error as any)?.stack || "");
  const match = stack.match(/public-catalog-launch\.service\.(?:js|ts):(\d+):\d+/);
  return match ? `public-catalog-launch.service:${match[1]}` : null;
}

function safeModelName(error: unknown): string | null {
  const model = String((error as any)?.meta?.modelName || "").trim();
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(model) ? model : null;
}

async function failRegistration(res: Response, error: unknown, stage: RegistrationStage) {
  if (error instanceof service.PublicCatalogError) {
    fail(res, error);
    return;
  }

  const databaseCode = prismaErrorCode(error);
  const errorType = safeErrorType(error);
  const sourceLocation = safeSourceLocation(error);
  const modelName = safeModelName(error);
  const retryableDatabaseCodes = new Set(["P1001", "P1002", "P2024", "P2028", "P2034"]);
  const retryable = Boolean(databaseCode && retryableDatabaseCodes.has(databaseCode));
  const status = retryable ? 503 : 500;
  const code = databaseCode ? "REGISTRATION_DATABASE_ERROR" : "REGISTRATION_INTERNAL_ERROR";
  const message = stage === "owner_session"
    ? "Workspace provisioning completed, but owner session setup could not complete"
    : "Workspace provisioning could not complete";
  const businessInsertCompatibility = stage === "tenant_provisioning"
    ? await collectBusinessInsertCompatibility()
    : null;

  console.error("Public registration failed", {
    referenceId: res.locals.requestId,
    stage,
    databaseCode,
    errorType,
    sourceLocation,
    modelName,
    retryable,
    businessInsertCompatibility,
    error,
  });

  if (retryable) res.setHeader("Retry-After", "2");
  res.status(status).json({
    ok: false,
    error: {
      code,
      message,
      details: {
        stage,
        retryable,
        errorType,
        ...(sourceLocation ? { sourceLocation } : {}),
        ...(modelName ? { modelName } : {}),
        ...(databaseCode ? { databaseCode } : {}),
        ...(businessInsertCompatibility ? { businessInsertCompatibility } : {}),
      },
      referenceId: res.locals.requestId,
    },
  });
}

export async function catalog(_req: Request, res: Response) {
  try {
    res.json({ ok: true, data: await service.catalogue() });
  } catch (error) {
    fail(res, error);
  }
}

export async function industry(req: Request, res: Response) {
  try {
    res.json({ ok: true, data: service.industryDetail(req.params.code) });
  } catch (error) {
    fail(res, error);
  }
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

  const role = user.userRoles.find(item => item.role.name === "Owner")?.role.name || user.userRoles[0]?.role.name || "Owner";
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
  let stage: RegistrationStage = "tenant_provisioning";
  try {
    const result = await service.register(req, req.body || {});
    stage = "owner_session";
    const auth = await createProvisionedOwnerSession(req, result, String(req.body?.password || ""));
    res.status(201).json({ ok: true, data: { ...result, auth } });
  } catch (error) {
    await failRegistration(res, error, stage);
  }
}
