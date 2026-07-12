import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };
const loginBuckets = new Map<string, Bucket>();

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = String(req.header("x-request-id") || "").trim();
  const id = /^[a-zA-Z0-9._:-]{8,100}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader("X-Request-Id", id);
  res.locals.requestId = id;
  next();
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const key = `${ip}:${email}`;
  const current = loginBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 15 * 60 * 1000 } : current;
  bucket.count += 1;
  loginBuckets.set(key, bucket);
  if (loginBuckets.size > 5000) for (const [bucketKey, value] of loginBuckets) if (value.resetAt <= now) loginBuckets.delete(bucketKey);
  res.setHeader("RateLimit-Limit", "10");
  res.setHeader("RateLimit-Remaining", String(Math.max(0, 10 - bucket.count)));
  if (bucket.count > 10) { res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000))); res.status(429).json({ ok: false, error: { message: "Too many login attempts. Please wait and try again.", referenceId: res.locals.requestId } }); return; }
  next();
}
