import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/http.js";
import { authenticateDeveloperApiKey, hasDeveloperScope } from "../services/developer-api-key.service.js";

function rawApiKey(req: Request): string | null {
  const direct = String(req.header("x-api-key") || "").trim();
  if (direct) return direct;
  const authorization = String(req.header("authorization") || "").trim();
  const match = /^ApiKey\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() || null;
}

export async function requireDeveloperApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = rawApiKey(req);
  if (!raw) {
    res.status(401).json({ ok: false, error: { message: "Developer API key required" } });
    return;
  }

  try {
    const key = await authenticateDeveloperApiKey(raw);
    req.tenant = {
      businessId: key.businessId,
      businessSlug: null,
      userId: null,
      source: "api-key",
    };
    req.developerApiKey = {
      id: key.id,
      name: key.name,
      scopes: key.scopes,
    };
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      res.status(error.status).json({ ok: false, error: { message: error.message, details: error.details } });
      return;
    }
    res.status(401).json({ ok: false, error: { message: "Invalid API key" } });
  }
}

export function requireDeveloperScope(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const scopes = req.developerApiKey?.scopes || [];
    const allowed = requiredScopes.some((scope) => hasDeveloperScope(scopes, scope));
    if (!allowed) {
      res.status(403).json({
        ok: false,
        error: {
          message: "API key scope denied",
          details: { anyOf: requiredScopes },
        },
      });
      return;
    }
    next();
  };
}
