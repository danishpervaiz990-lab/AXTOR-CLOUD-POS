import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };
const loginBuckets = new Map<string, Bucket>();
const registrationBuckets = new Map<string, Bucket>();
const groceryHeavyBuckets = new Map<string, Bucket>();

function requestIp(req: Request) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function pruneExpired(buckets: Map<string, Bucket>, now: number, maxSize = 5000) {
  if (buckets.size <= maxSize) return;
  for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = String(req.header("x-request-id") || "").trim();
  const id = /^[a-zA-Z0-9._:-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader("X-Request-Id", id);
  res.locals.requestId = id;
  next();
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const ip = requestIp(req);
  const email = String(req.body?.email || "").trim().toLowerCase();
  const key = `${ip}:${email}`;
  const current = loginBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 15 * 60 * 1000 } : current;
  bucket.count += 1;
  loginBuckets.set(key, bucket);
  pruneExpired(loginBuckets, now);
  res.setHeader("RateLimit-Limit", "10");
  res.setHeader("RateLimit-Remaining", String(Math.max(0, 10 - bucket.count)));
  if (bucket.count > 10) { res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000))); res.status(429).json({ ok: false, error: { message: "Too many login attempts. Please wait and try again.", referenceId: res.locals.requestId } }); return; }
  next();
}

export function registrationRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const ip = requestIp(req);
  const email = String(req.body?.email || "").trim().toLowerCase();
  const key = `${ip}:${email}`;
  const current = registrationBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60 * 60 * 1000 } : current;
  bucket.count += 1;
  registrationBuckets.set(key, bucket);
  pruneExpired(registrationBuckets, now);
  res.setHeader("RateLimit-Limit", "5");
  res.setHeader("RateLimit-Remaining", String(Math.max(0, 5 - bucket.count)));
  if (bucket.count > 5) {
    res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ ok: false, error: { code: "REGISTRATION_RATE_LIMIT", message: "Too many registration attempts. Please wait and try again.", referenceId: res.locals.requestId } });
    return;
  }
  next();
}

/**
 * Protects expensive authenticated Grocery maintenance operations from accidental
 * double-click storms or scripted abuse without throttling normal checkout/search.
 * Keyed by tenant + user + IP and deliberately limited to heavy mutation routes.
 */
export function groceryHeavyOperationRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const businessId = String(req.tenant?.businessId || "unknown-business");
  const userId = String(req.tenant?.userId || "unknown-user");
  const key = `${businessId}:${userId}:${requestIp(req)}`;
  const current = groceryHeavyBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 5 * 60 * 1000 } : current;
  bucket.count += 1;
  groceryHeavyBuckets.set(key, bucket);
  pruneExpired(groceryHeavyBuckets, now, 10_000);
  res.setHeader("RateLimit-Limit", "60");
  res.setHeader("RateLimit-Remaining", String(Math.max(0, 60 - bucket.count)));
  if (bucket.count > 60) {
    res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ ok: false, error: { code: "GROCERY_OPERATION_RATE_LIMIT", message: "Too many heavy Grocery operations. Retry after the rate-limit window.", referenceId: res.locals.requestId } });
    return;
  }
  next();
}
