import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/http.js";

export type EntitlementContext = {
  plan: any;
  subscription: any;
  features: Record<string, { enabled: boolean; limit: number | null }>;
  limits: Record<string, number | null>;
  readOnly: boolean;
};

const LIMIT_FEATURES: Record<string, string> = {
  users: "limits.users",
  branches: "limits.branches",
  warehouses: "limits.warehouses",
  currencies: "limits.currencies",
  languages: "limits.languages",
};
const entitlementCache = new Map<string, { expiresAt: number; value: EntitlementContext }>();

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadEntitlements(tx: any, businessId: string): Promise<EntitlementContext> {
  if (tx === prisma) { const cached = entitlementCache.get(businessId); if (cached && cached.expiresAt > Date.now()) return cached.value; }
  const business = await tx.business.findUnique({ where: { id: businessId } });
  if (!business) throw new ApiError(401, "Business is no longer available");

  let subscription = await tx.tenantSubscription.findFirst({
    where: { businessId, isCurrent: true },
    include: { plan: { include: { features: true } } },
    orderBy: { createdAt: "desc" },
  });

  let plan = subscription?.plan || null;
  if (!plan) {
    const legacyCode = String(business.subscriptionPlan || "basic").toLowerCase();
    plan = await tx.subscriptionPlan.findFirst({ where: { code: legacyCode, active: true }, include: { features: true } });
    if (!plan) plan = await tx.subscriptionPlan.findFirst({ where: { code: "basic", active: true }, include: { features: true } });
  }

  const overrides = await tx.tenantFeatureOverride.findMany({
    where: { businessId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  });
  const features: Record<string, { enabled: boolean; limit: number | null }> = {};
  for (const feature of plan?.features || []) {
    features[feature.featureKey] = { enabled: Boolean(feature.enabled), limit: numeric(feature.limitValue) };
  }
  for (const override of overrides) {
    const current = features[override.featureKey] || { enabled: false, limit: null };
    features[override.featureKey] = {
      enabled: override.enabled === null ? current.enabled : Boolean(override.enabled),
      limit: override.limitValue === null ? current.limit : numeric(override.limitValue),
    };
  }

  const customLimits = subscription?.customLimits && typeof subscription.customLimits === "object" ? subscription.customLimits : {};
  const limits: Record<string, number | null> = {
    users: numeric(customLimits.users ?? plan?.maxUsers),
    branches: numeric(customLimits.branches ?? plan?.maxBranches),
    warehouses: numeric(customLimits.warehouses ?? plan?.maxWarehouses),
    currencies: numeric(customLimits.currencies ?? plan?.maxCurrencies),
    languages: numeric(customLimits.languages ?? plan?.maxLanguages),
  };
  for (const [name, featureKey] of Object.entries(LIMIT_FEATURES)) {
    if (features[featureKey]?.limit !== null && features[featureKey]?.limit !== undefined) limits[name] = features[featureKey].limit;
  }

  const status = String(subscription?.status || business.subscriptionStatus || business.status || "TRIAL").toUpperCase();
  const periodExpired = subscription?.currentPeriodEnd && new Date(subscription.currentPeriodEnd).getTime() < Date.now();
  const graceActive = subscription?.graceEndsAt && new Date(subscription.graceEndsAt).getTime() >= Date.now();
  const businessBlocked = ["SUSPENDED", "CANCELLED"].includes(String(business.status || "").toUpperCase());
  const readOnly = Boolean(business.maintenanceMode) || businessBlocked || ["SUSPENDED", "CANCELLED", "EXPIRED"].includes(status) || (periodExpired && !graceActive);
  const result = { plan, subscription, features, limits, readOnly };
  if (tx === prisma) entitlementCache.set(businessId, { expiresAt: Date.now() + 10_000, value: result });
  return result;
}

export function clearEntitlementCache(businessId?: string): void { if (businessId) entitlementCache.delete(businessId); else entitlementCache.clear(); }

export async function assertUsageLimit(tx: any, businessId: string, resource: keyof EntitlementContext["limits"], increment = 1): Promise<void> {
  const context = await loadEntitlements(tx, businessId);
  const limit = context.limits[resource];
  if (limit === null) return;
  const model = resource === "users" ? tx.user : resource === "branches" ? tx.branch : resource === "warehouses" ? tx.warehouse : resource === "currencies" ? tx.businessCurrency : null;
  if (!model) return;
  const count = await model.count({ where: resource === "users" ? { businessId, status: { not: "DISABLED" } } : { businessId, ...(resource === "branches" || resource === "warehouses" ? { active: true } : {}) } });
  if (count + increment > limit) throw new ApiError(403, `${resource} limit reached for the current subscription`, { limit, current: count, upgradeRequired: true });
}

export function requireFeature(featureKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const businessId = req.tenant?.businessId;
      if (!businessId) throw new ApiError(401, "Authenticated business is required");
      const context = await loadEntitlements(prisma, businessId);
      if (context.readOnly && req.method !== "GET" && req.method !== "HEAD") throw new ApiError(402, "Subscription is read-only. Renew or contact support.");
      if (!context.features[featureKey]?.enabled) throw new ApiError(403, "Feature is not included in the current subscription", { featureKey, upgradeRequired: true });
      next();
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      res.status(status).json({ ok: false, error: { message: error instanceof Error ? error.message : "Feature check failed", details: error instanceof ApiError ? error.details : undefined } });
    }
  };
}
