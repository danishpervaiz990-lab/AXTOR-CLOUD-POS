import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { hashPassword } from "../utils/password.js";
import { ApiError, cleanString, plain, requireText } from "../utils/http.js";
import { writeAudit } from "./audit.service.js";
import { clearEntitlementCache } from "./entitlements.service.js";

function strongPassword(password: string): boolean { return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password); }

export async function listTenants(query: any) {
  const search = cleanString(query?.search); const page = Math.max(1, Number(query?.page || 1)); const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize || 25)));
  const where: any = search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }] } : {};
  const [total, rows] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.findMany({ where, include: { tenantSubscriptions: { where: { isCurrent: true }, include: { plan: true }, take: 1 }, businessIndustry: { include: { industry: true } }, _count: { select: { users: true, branches: true, warehouses: true, products: true, salesDocuments: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return plain({ rows, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}

export async function createTenant(req: Request, actorUserId: string | null, input: any) {
  const name = requireText(input?.businessName, "Business name"); const slug = requireText(input?.businessSlug, "Business slug").toLowerCase(); const ownerName = requireText(input?.ownerName, "Owner name"); const email = requireText(input?.ownerEmail, "Owner email").toLowerCase(); const password = String(input?.temporaryPassword || "");
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(slug)) throw new ApiError(400, "Business slug must use lowercase letters, numbers, and hyphens");
  if (!strongPassword(password)) throw new ApiError(400, "Temporary password must be at least 12 characters with uppercase, lowercase, number, and symbol");
  const plan = await prisma.subscriptionPlan.findUnique({ where: { code: String(input?.planCode || "basic").toLowerCase() } });
  if (!plan?.active) throw new ApiError(400, "Subscription plan is unavailable");
  return prisma.$transaction(async tx => {
    const business = await tx.business.create({ data: { name, slug, status: "TRIAL", country: String(input?.country || "QA").toUpperCase(), timezone: String(input?.timezone || "Asia/Qatar"), currency: String(input?.currency || "QAR").toUpperCase(), subscriptionPlan: plan.code, subscriptionStatus: "TRIAL", trialEndsAt: new Date(Date.now() + Number(input?.trialDays || 14) * 86400000) } });
    const role = await tx.role.create({ data: { businessId: business.id, name: "Business Owner", description: "Tenant owner with full tenant access", isSystemRole: true, permissions: ["*"] } });
    const user = await tx.user.create({ data: { businessId: business.id, name: ownerName, email, passwordHash: hashPassword(password), mustChangePassword: true, status: "ACTIVE" } });
    await tx.userRole.create({ data: { businessId: business.id, userId: user.id, roleId: role.id } });
    const trialEndsAt = business.trialEndsAt || new Date(Date.now() + 14 * 86400000);
    await tx.tenantSubscription.create({ data: { businessId: business.id, planId: plan.id, status: "TRIAL", billingCycle: String(input?.billingCycle || "MONTHLY").toUpperCase() === "ANNUAL" ? "ANNUAL" : "MONTHLY", trialEndsAt, currentPeriodStart: new Date(), currentPeriodEnd: trialEndsAt, provider: "manual", isCurrent: true } });
    await tx.tenantOnboarding.create({ data: { businessId: business.id, currentStep: 1, completedSteps: [], state: "NOT_STARTED", answers: {}, sampleDataRequested: false } });
    await writeAudit(tx, req, { businessId: business.id, userId: actorUserId, action: "platform.tenant.create", entityType: "Business", entityId: business.id, after: { name, slug, ownerEmail: email, planCode: plan.code } });
    return plain({ business, owner: { id: user.id, name: user.name, email: user.email }, temporaryPasswordMustBeChanged: true });
  });
}

export async function updateTenant(req: Request, actorUserId: string | null, businessId: string, input: any) {
  const result = await prisma.$transaction(async tx => {
    const before = await tx.business.findUnique({ where: { id: businessId } }); if (!before) throw new ApiError(404, "Tenant not found");
    const status = input?.status ? String(input.status).toUpperCase() : undefined; if (status && !["ACTIVE", "TRIAL", "SUSPENDED", "CANCELLED"].includes(status)) throw new ApiError(400, "Invalid tenant status");
    const row = await tx.business.update({ where: { id: businessId }, data: { ...(status ? { status: status as any } : {}), ...(input?.maintenanceMode !== undefined ? { maintenanceMode: Boolean(input.maintenanceMode) } : {}) } });
    if (status === "SUSPENDED" || status === "CANCELLED") await tx.authSession.updateMany({ where: { businessId, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(tx, req, { businessId, userId: actorUserId, action: "platform.tenant.update", entityType: "Business", entityId: businessId, before, after: row }); return plain(row);
  });
  clearEntitlementCache(businessId); return result;
}

export async function changeSubscription(req: Request, actorUserId: string | null, businessId: string, input: any) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { code: String(input?.planCode || "").toLowerCase() } }); if (!plan?.active) throw new ApiError(400, "Subscription plan is unavailable");
  const status = String(input?.status || "ACTIVE").toUpperCase(); if (!["TRIAL", "ACTIVE", "GRACE", "SUSPENDED", "CANCELLED", "EXPIRED"].includes(status)) throw new ApiError(400, "Invalid subscription status");
  const result = await prisma.$transaction(async tx => {
    await tx.tenantSubscription.updateMany({ where: { businessId, isCurrent: true }, data: { isCurrent: false } });
    const periodDays = String(input?.billingCycle || "MONTHLY").toUpperCase() === "ANNUAL" ? 365 : 30; const startsAt = new Date(); const periodEnd = input?.periodEnd ? new Date(input.periodEnd) : new Date(Date.now() + periodDays * 86400000);
    const row = await tx.tenantSubscription.create({ data: { businessId, planId: plan.id, status: status as any, billingCycle: String(input?.billingCycle || "MONTHLY").toUpperCase() === "ANNUAL" ? "ANNUAL" : "MONTHLY", startsAt, currentPeriodStart: startsAt, currentPeriodEnd: periodEnd, graceEndsAt: input?.graceEndsAt ? new Date(input.graceEndsAt) : null, customLimits: input?.customLimits || undefined, provider: "manual", providerReference: cleanString(input?.reference) || null, isCurrent: true } });
    await tx.business.update({ where: { id: businessId }, data: { subscriptionPlan: plan.code, subscriptionStatus: status, status: (status === "TRIAL" ? "TRIAL" : ["SUSPENDED", "CANCELLED"].includes(status) ? status : "ACTIVE") as any } });
    await writeAudit(tx, req, { businessId, userId: actorUserId, action: "platform.subscription.change", entityType: "TenantSubscription", entityId: row.id, after: { planCode: plan.code, status, periodEnd, customLimits: input?.customLimits || null } }); return plain(row);
  });
  clearEntitlementCache(businessId); return result;
}

export async function saveOverride(req: Request, actorUserId: string | null, businessId: string, input: any) {
  const featureKey = requireText(input?.featureKey, "Feature key");
  const result = await prisma.$transaction(async tx => { if (!await tx.business.findUnique({ where: { id: businessId } })) throw new ApiError(404, "Tenant not found"); const row = await tx.tenantFeatureOverride.upsert({ where: { businessId_featureKey: { businessId, featureKey } }, create: { businessId, featureKey, enabled: input?.enabled === undefined ? null : Boolean(input.enabled), limitValue: input?.limitValue === undefined || input?.limitValue === null ? null : Number(input.limitValue), reason: cleanString(input?.reason) || null, expiresAt: input?.expiresAt ? new Date(input.expiresAt) : null }, update: { enabled: input?.enabled === undefined ? null : Boolean(input.enabled), limitValue: input?.limitValue === undefined || input?.limitValue === null ? null : Number(input.limitValue), reason: cleanString(input?.reason) || null, expiresAt: input?.expiresAt ? new Date(input.expiresAt) : null } }); await writeAudit(tx, req, { businessId, userId: actorUserId, action: "platform.feature_override", entityType: "TenantFeatureOverride", entityId: row.id, after: row }); return plain(row); });
  clearEntitlementCache(businessId); return result;
}

export async function resetOnboarding(req: Request, actorUserId: string | null, businessId: string) {
  return prisma.$transaction(async tx => { const row = await tx.tenantOnboarding.upsert({ where: { businessId }, create: { businessId, state: "NOT_STARTED", currentStep: 1, completedSteps: [], answers: {} }, update: { state: "NOT_STARTED", currentStep: 1, completedSteps: [], completedAt: null } }); await tx.business.update({ where: { id: businessId }, data: { onboardingState: "NOT_STARTED", onboardingStep: 1, onboardingCompletedAt: null } }); await writeAudit(tx, req, { businessId, userId: actorUserId, action: "platform.onboarding.reset", entityType: "TenantOnboarding", entityId: row.id, after: { reset: true } }); return plain(row); });
}

export async function revokeSessions(req: Request, actorUserId: string | null, businessId: string) {
  const result = await prisma.authSession.updateMany({ where: { businessId, revokedAt: null }, data: { revokedAt: new Date() } });
  await prisma.auditLog.create({ data: { businessId, userId: actorUserId, action: "platform.sessions.revoke", entityType: "AuthSession", after: { count: result.count }, ipAddress: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim() || null, userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || null } });
  return { revoked: result.count };
}
