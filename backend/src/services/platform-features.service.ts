import { prisma } from "../db/prisma.js";
import { getBackupProviderStatus } from "./backup-provider.service.js";
import { listApiKeys } from "./developer-api-key.service.js";

export const PLATFORM_FEATURES = [
  "ai_insights","mobile_scanner","whatsapp","email","sms","loyalty","gift_cards",
  "multi_warehouse","offline_sync","audit_logs","approvals","multi_company","tax_engine",
  "currency_lock","scheduled_backups","advanced_analytics","dashboard_builder","developer_api"
] as const;

export async function getCapabilityStatus(businessId: string) {
  const backupProvider = getBackupProviderStatus();
  const [business, warehouseCount, approvalCount, loyaltyCount, auditCount, communicationCount, currencyCount, taxRateCount, apiKeys] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { id: true, name: true, country: true, currency: true, defaultLanguage: true } }),
    prisma.warehouse.count({ where: { businessId } }),
    prisma.approvalRule.count({ where: { businessId, active: true } }),
    prisma.loyaltyProgram.count({ where: { businessId, active: true } }),
    prisma.auditLog.count({ where: { businessId } }),
    prisma.communicationLog.count({ where: { businessId } }),
    prisma.businessCurrency.count({ where: { businessId, active: true } }),
    prisma.taxRate.count({ where: { businessId, active: true } }),
    listApiKeys(businessId),
  ]);
  return {
    business,
    features: {
      ai_insights: { state: "available", mode: "deterministic" },
      mobile_scanner: { state: "available", mode: "browser-camera" },
      whatsapp: { state: "available", mode: "share-link", providerConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN) },
      email: { state: "available", mode: "mailto-or-provider", providerConfigured: Boolean(process.env.EMAIL_API_KEY) },
      sms: { state: "configured", providerConfigured: Boolean(process.env.SMS_API_KEY) },
      loyalty: { state: loyaltyCount > 0 ? "active" : "ready", programCount: loyaltyCount },
      gift_cards: { state: "settings-backed" },
      multi_warehouse: { state: "active", warehouseCount },
      offline_sync: { state: "frontend-ready", serverIdempotencyRequired: true },
      audit_logs: { state: "active", eventCount: auditCount },
      approvals: { state: approvalCount > 0 ? "active" : "ready", ruleCount: approvalCount },
      multi_company: { state: "company-context-required" },
      tax_engine: { state: taxRateCount > 0 ? "active" : "ready", taxRateCount },
      currency_lock: { state: currencyCount > 0 ? "active" : "ready", currencyCount },
      scheduled_backups: {
        state: backupProvider.configured ? "ready" : "provider-required",
        providerConfigured: backupProvider.configured,
        provider: backupProvider.provider,
        storageConfigured: backupProvider.storageConfigured,
        encryptionConfigured: backupProvider.encryptionConfigured,
      },
      advanced_analytics: { state: "available" },
      dashboard_builder: { state: "settings-backed" },
      developer_api: {
        state: "active",
        mode: "tenant-addressable-api-key-v2",
        activeKeyCount: apiKeys.filter((key) => key.active !== false && !key.revokedAt).length,
        endpoints: ["/api/v1/developer/status", "/api/v1/developer/products"],
      },
      communications: { state: "active", logCount: communicationCount },
    },
  };
}

export async function listAuditLogs(businessId: string, limit = 100) {
  return prisma.auditLog.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: Math.min(Math.max(limit, 1), 500) });
}

export async function writeAuditLog(input: { businessId: string; userId?: string; action: string; entityType?: string; entityId?: string; before?: unknown; after?: unknown; ipAddress?: string; userAgent?: string; }) {
  return prisma.auditLog.create({ data: {
    businessId: input.businessId,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before as any,
    after: input.after as any,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  } });
}
