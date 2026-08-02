import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { ApiError, cleanString, numberValue } from "../utils/http.js";
import { requireBackupProvider } from "./backup-provider.service.js";

type JsonRecord = Record<string, any>;
const asJson = (value: any): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

async function readSetting(businessId: string, key: string, fallback: any = null): Promise<any> {
  const row = await prisma.appSetting.findUnique({ where: { businessId_key: { businessId, key } } });
  return row?.value ?? fallback;
}

async function writeSetting(businessId: string, key: string, value: any): Promise<any> {
  const row = await prisma.appSetting.upsert({ where: { businessId_key: { businessId, key } }, update: { value: asJson(value) }, create: { businessId, key, value: asJson(value) } });
  return row.value;
}

export async function listResource(businessId: string, resource: string): Promise<any[]> {
  const value = await readSetting(businessId, `platform.${resource}`, []);
  return Array.isArray(value) ? value : [];
}

export async function createResource(businessId: string, userId: string | null, resource: string, input: JsonRecord): Promise<any> {
  const rows = await listResource(businessId, resource);
  const now = new Date().toISOString();
  const record = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
  rows.push(record);
  await writeSetting(businessId, `platform.${resource}`, rows);
  await prisma.auditLog.create({ data: { businessId, userId, action: `platform.${resource}.create`, entityType: resource, entityId: record.id, after: asJson(record) } });
  return record;
}

export async function updateResource(businessId: string, userId: string | null, resource: string, id: string, input: JsonRecord): Promise<any> {
  const rows = await listResource(businessId, resource);
  const index = rows.findIndex((row) => row?.id === id);
  if (index < 0) throw new ApiError(404, `${resource} record not found`);
  const before = rows[index];
  const record = { ...before, ...input, id, updatedAt: new Date().toISOString() };
  rows[index] = record;
  await writeSetting(businessId, `platform.${resource}`, rows);
  await prisma.auditLog.create({ data: { businessId, userId, action: `platform.${resource}.update`, entityType: resource, entityId: id, before: asJson(before), after: asJson(record) } });
  return record;
}

export async function deleteResource(businessId: string, userId: string | null, resource: string, id: string): Promise<void> {
  const rows = await listResource(businessId, resource);
  const before = rows.find((row) => row?.id === id);
  if (!before) throw new ApiError(404, `${resource} record not found`);
  await writeSetting(businessId, `platform.${resource}`, rows.filter((row) => row?.id !== id));
  await prisma.auditLog.create({ data: { businessId, userId, action: `platform.${resource}.delete`, entityType: resource, entityId: id, before: asJson(before) } });
}

export async function issueGiftCard(businessId: string, userId: string | null, input: JsonRecord): Promise<any> {
  const amount = numberValue(input.amount);
  if (amount <= 0) throw new ApiError(400, "Gift card amount must be greater than zero");
  const code = cleanString(input.code) || `GC-${randomBytes(5).toString("hex").toUpperCase()}`;
  return createResource(businessId, userId, "gift-cards", { code, initialBalance: amount, balance: amount, currency: cleanString(input.currency) || "QAR", status: "active", customerId: cleanString(input.customerId), expiresAt: cleanString(input.expiresAt), ledger: [] });
}

export async function transactGiftCard(businessId: string, userId: string | null, id: string, input: JsonRecord): Promise<any> {
  const rows = await listResource(businessId, "gift-cards");
  const index = rows.findIndex((row) => row?.id === id);
  if (index < 0) throw new ApiError(404, "Gift card not found");
  const card = rows[index];
  const amount = numberValue(input.amount);
  const type = cleanString(input.type);
  if (!type || !["redeem", "load", "refund"].includes(type)) throw new ApiError(400, "type must be redeem, load or refund");
  if (amount <= 0) throw new ApiError(400, "Amount must be greater than zero");
  const nextBalance = type === "redeem" ? Number(card.balance || 0) - amount : Number(card.balance || 0) + amount;
  if (nextBalance < 0) throw new ApiError(409, "Insufficient gift card balance");
  const entry = { id: randomUUID(), type, amount, referenceNo: cleanString(input.referenceNo), createdAt: new Date().toISOString(), userId };
  const updated = { ...card, balance: nextBalance, ledger: [...(Array.isArray(card.ledger) ? card.ledger : []), entry], updatedAt: new Date().toISOString() };
  rows[index] = updated;
  await writeSetting(businessId, "platform.gift-cards", rows);
  await prisma.auditLog.create({ data: { businessId, userId, action: `gift-card.${type}`, entityType: "gift-card", entityId: id, before: asJson(card), after: asJson(updated) } });
  return updated;
}

export async function platformSummary(businessId: string): Promise<any> {
  const [giftCards, companies, apiKeys, webhooks, dashboards, backups] = await Promise.all([
    listResource(businessId, "gift-cards"),
    listResource(businessId, "companies"),
    listResource(businessId, "api-keys"),
    listResource(businessId, "webhooks"),
    listResource(businessId, "dashboards"),
    prisma.backupJob.count({ where: { businessId } }),
  ]);
  return { giftCards: giftCards.length, companies: companies.length, apiKeys: apiKeys.filter((x) => x.active !== false).length, webhooks: webhooks.filter((x) => x.active !== false).length, dashboards: dashboards.length, backups };
}

export async function createBackupManifest(businessId: string, userId: string | null, input: JsonRecord): Promise<any> {
  const provider = requireBackupProvider(input.provider);
  const idempotencyKey = cleanString(input.idempotencyKey) || null;
  if (idempotencyKey) {
    const existing = await prisma.backupJob.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey } } });
    if (existing) return existing;
  }
  const job = await prisma.backupJob.create({
    data: {
      businessId,
      requestedBy: userId,
      provider: provider.provider,
      encrypted: true,
      idempotencyKey,
      maxAttempts: Math.min(Math.max(Number(input.maxAttempts) || Number(process.env.BACKUP_MAX_ATTEMPTS) || 3, 1), 10),
    },
  });
  await prisma.auditLog.create({
    data: {
      businessId,
      userId,
      action: "platform.backups.request",
      entityType: "backup-job",
      entityId: job.id,
      after: asJson({ provider: job.provider, status: job.status, requestedAt: job.requestedAt }),
    },
  });
  return job;
}

export async function listBackupJobs(businessId: string): Promise<any[]> {
  return prisma.backupJob.findMany({
    where: { businessId },
    orderBy: { requestedAt: "desc" },
    take: 100,
  });
}
