import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/http.js";
import { authenticateDeveloperApiKey, hasDeveloperScope } from "../services/developer-api-key.service.js";

type RateBucket = { count: number; resetAt: number };
const developerBuckets = new Map<string, RateBucket>();
const DEVELOPER_RATE_LIMIT = 120;
const DEVELOPER_RATE_WINDOW_MS = 60 * 1000;

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

export function developerApiRateLimit(req: Request, res: Response, next: NextFunction): void {
  const keyId = req.developerApiKey?.id;
  if (!keyId) {
    res.status(401).json({ ok: false, error: { message: "Developer API key required" } });
    return;
  }
  const now = Date.now();
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const bucketKey = `${keyId}:${ip}`;
  const current = developerBuckets.get(bucketKey);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + DEVELOPER_RATE_WINDOW_MS } : current;
  bucket.count += 1;
  developerBuckets.set(bucketKey, bucket);
  if (developerBuckets.size > 5000) {
    for (const [storedKey, value] of developerBuckets) if (value.resetAt <= now) developerBuckets.delete(storedKey);
  }
  const remaining = Math.max(0, DEVELOPER_RATE_LIMIT - bucket.count);
  res.setHeader("RateLimit-Limit", String(DEVELOPER_RATE_LIMIT));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
  if (bucket.count > DEVELOPER_RATE_LIMIT) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
    res.status(429).json({ ok: false, error: { message: "Developer API rate limit exceeded", referenceId: res.locals.requestId } });
    return;
  }
  next();
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
