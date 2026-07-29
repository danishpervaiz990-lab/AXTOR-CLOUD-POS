import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { ApiError, cleanString } from "../utils/http.js";

const SETTING_KEY = "platform.api-keys";
const MAX_ACTIVE_KEYS = 20;
const MAX_EXPIRY_DAYS = 366;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const ALLOWED_SCOPES = new Set(["developer.status.read", "products.read"]);

type KeyRecord = {
  id: string;
  version: number;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  active: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeveloperApiKeyContext = {
  id: string;
  businessId: string;
  name: string;
  scopes: string[];
};

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

async function readKeys(businessId: string): Promise<KeyRecord[]> {
  const row = await prisma.appSetting.findUnique({ where: { businessId_key: { businessId, key: SETTING_KEY } } });
  return Array.isArray(row?.value) ? row.value as unknown as KeyRecord[] : [];
}

async function writeKeys(businessId: string, keys: KeyRecord[]): Promise<void> {
  await prisma.appSetting.upsert({
    where: { businessId_key: { businessId, key: SETTING_KEY } },
    update: { value: asJson(keys) },
    create: { businessId, key: SETTING_KEY, value: asJson(keys) },
  });
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function hashesEqual(expectedHex: string, actualHex: string): boolean {
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(actualHex, "hex");
    return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function normalizeScopes(input: unknown): string[] {
  const requested = Array.isArray(input) && input.length ? input : ["developer.status.read"];
  const normalized = new Set<string>();
  for (const raw of requested) {
    const scope = String(raw || "").trim().toLowerCase();
    if (!scope) continue;
    if (scope === "read") {
      normalized.add("developer.status.read");
      normalized.add("products.read");
      continue;
    }
    if (!ALLOWED_SCOPES.has(scope)) throw new ApiError(400, `Unsupported API key scope: ${scope}`);
    normalized.add(scope);
  }
  if (!normalized.size) throw new ApiError(400, "At least one API key scope is required");
  return [...normalized].sort();
}

function normalizeExpiry(input: unknown): string | null {
  const text = cleanString(input);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) throw new ApiError(400, "API key expiry must be a future date");
  if (date.getTime() > Date.now() + MAX_EXPIRY_DAYS * 86400000) throw new ApiError(400, `API key expiry cannot exceed ${MAX_EXPIRY_DAYS} days`);
  return date.toISOString();
}

function publicRecord(record: KeyRecord) {
  const { keyHash: _keyHash, ...safe } = record;
  return safe;
}

export async function listApiKeys(businessId: string): Promise<any[]> {
  return (await readKeys(businessId)).map(publicRecord);
}

export async function createApiKey(businessId: string, userId: string | null, input: Record<string, unknown>): Promise<any> {
  const keys = await readKeys(businessId);
  if (keys.filter((key) => key.active !== false && !key.revokedAt).length >= MAX_ACTIVE_KEYS) {
    throw new ApiError(409, `A maximum of ${MAX_ACTIVE_KEYS} active API keys is allowed`);
  }

  const name = (cleanString(input.name) || "Developer key").slice(0, 100);
  const scopes = normalizeScopes(input.scopes);
  const expiresAt = normalizeExpiry(input.expiresAt);
  const raw = `axt2_${businessId}_${randomBytes(24).toString("hex")}`;
  const now = new Date().toISOString();
  const record: KeyRecord = {
    id: randomUUID(),
    version: 2,
    name,
    keyPrefix: `${raw.slice(0, Math.min(raw.length, 18))}…`,
    keyHash: hashKey(raw),
    scopes,
    active: true,
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
    revokedByUserId: null,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };
  keys.push(record);
  await writeKeys(businessId, keys);
  await prisma.auditLog.create({
    data: {
      businessId,
      userId,
      action: "developer-api-key.create",
      entityType: "developer-api-key",
      entityId: record.id,
      after: asJson({ name, keyPrefix: record.keyPrefix, scopes, expiresAt }),
    },
  });
  return { ...publicRecord(record), secret: raw };
}

export async function revokeApiKey(businessId: string, userId: string | null, id: string): Promise<any> {
  const keys = await readKeys(businessId);
  const index = keys.findIndex((key) => key.id === id);
  if (index < 0) throw new ApiError(404, "API key not found");
  const before = keys[index];
  if (before.revokedAt || before.active === false) return publicRecord(before);
  const now = new Date().toISOString();
  const updated: KeyRecord = { ...before, active: false, revokedAt: now, revokedByUserId: userId, updatedAt: now };
  keys[index] = updated;
  await writeKeys(businessId, keys);
  await prisma.auditLog.create({
    data: {
      businessId,
      userId,
      action: "developer-api-key.revoke",
      entityType: "developer-api-key",
      entityId: id,
      before: asJson({ active: before.active, revokedAt: before.revokedAt }),
      after: asJson({ active: false, revokedAt: now }),
    },
  });
  return publicRecord(updated);
}

export async function authenticateDeveloperApiKey(rawInput: unknown): Promise<DeveloperApiKeyContext> {
  const raw = String(rawInput || "").trim();
  const match = /^axt2_([a-z0-9]{10,64})_([a-f0-9]{48})$/i.exec(raw);
  if (!match) throw new ApiError(401, "Invalid API key");
  const businessId = match[1];
  const keys = await readKeys(businessId);
  const actualHash = hashKey(raw);
  const index = keys.findIndex((key) => key.version === 2 && hashesEqual(key.keyHash, actualHash));
  if (index < 0) throw new ApiError(401, "Invalid API key");

  const key = keys[index];
  if (key.active === false || key.revokedAt) throw new ApiError(401, "API key has been revoked");
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) throw new ApiError(401, "API key has expired");

  const business = await prisma.business.findFirst({ where: { id: businessId, status: { in: ["ACTIVE", "TRIAL"] } }, select: { id: true } });
  if (!business) throw new ApiError(403, "API key business is not active");

  const lastUsed = key.lastUsedAt ? new Date(key.lastUsedAt).getTime() : 0;
  if (!lastUsed || Date.now() - lastUsed > LAST_USED_WRITE_INTERVAL_MS) {
    const now = new Date().toISOString();
    keys[index] = { ...key, lastUsedAt: now, updatedAt: now };
    void writeKeys(businessId, keys).catch(() => undefined);
  }

  return { id: key.id, businessId, name: key.name, scopes: [...key.scopes] };
}

export function hasDeveloperScope(scopes: string[], required: string): boolean {
  return scopes.includes("*") || scopes.includes(required);
}
