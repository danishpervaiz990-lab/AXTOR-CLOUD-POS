import type { Request, Response } from "express";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function tenant(req: Request): { businessId: string; userId: string | null } {
  const businessId = req.tenant?.businessId;
  if (!businessId) throw new ApiError(401, "Authenticated business is required");
  return { businessId, userId: req.tenant?.userId || null };
}

export function cleanString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

export function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on", "active"].includes(text)) return true;
  if (["false", "0", "no", "off", "inactive"].includes(text)) return false;
  return fallback;
}

export function dateValue(value: unknown): Date | undefined {
  const text = cleanString(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function monthRange(monthInput?: unknown): { month: string; start: Date; end: Date } {
  const fallback = new Date().toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(String(monthInput || "")) ? String(monthInput) : fallback;
  const [year, monthNo] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNo - 1, 1));
  const end = new Date(Date.UTC(year, monthNo, 1));
  return { month, start, end };
}

export function dateRange(fromInput?: unknown, toInput?: unknown, fallbackDays = 30): { from: Date; to: Date } {
  const now = new Date();
  const from = dateValue(fromInput) || new Date(now.getTime() - fallbackDays * 86400000);
  const toBase = dateValue(toInput) || now;
  const to = new Date(toBase);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function plain<T = unknown>(value: T): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(plain);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const candidate = value as any;
    if (typeof candidate.toNumber === "function") return candidate.toNumber();
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(candidate)) output[key] = plain(item);
    return output;
  }
  return value;
}

export function isPrismaUniqueError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as any).code === "P2002");
}

export function isPrismaNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as any).code === "P2025");
}

export function handleError(res: Response, error: unknown): void {
  const referenceId = res.locals.requestId || undefined;
  if (error instanceof ApiError) {
    res.status(error.status).json({ ok: false, error: { message: error.message, details: error.details, referenceId } });
    return;
  }
  if (isPrismaUniqueError(error)) {
    res.status(409).json({ ok: false, error: { message: "A record with the same unique value already exists", referenceId } });
    return;
  }
  if (isPrismaNotFoundError(error)) {
    res.status(404).json({ ok: false, error: { message: "Record not found", referenceId } });
    return;
  }
  console.error(error);
  res.status(500).json({ ok: false, error: { message: "Internal server error", referenceId } });
}

export function requireText(value: unknown, field: string): string {
  const text = cleanString(value);
  if (!text) throw new ApiError(400, `${field} is required`);
  return text;
}

export function queryLimit(value: unknown, fallback = 100, max = 500): number {
  return Math.min(max, Math.max(1, Math.floor(numberValue(value, fallback))));
}
