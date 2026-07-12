import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { loadUserAccess, requirePermission } from "./access.service.js";
import { loadEntitlements } from "./entitlements.service.js";
import { writeAudit } from "./audit.service.js";
import { ApiError, cleanString, plain, requireText } from "../utils/http.js";

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", direction: "ltr", productionReady: true },
  { code: "ar", name: "العربية", direction: "rtl", productionReady: true },
  { code: "zh-CN", name: "简体中文", direction: "ltr", productionReady: true },
  { code: "hi", name: "हिन्दी", direction: "ltr", productionReady: true },
  { code: "ur", name: "اردو", direction: "rtl", productionReady: true },
  { code: "hinglish", name: "Hinglish", direction: "ltr", productionReady: true },
  { code: "sw", name: "Kiswahili", direction: "ltr", productionReady: true },
  { code: "fr", name: "Français", direction: "ltr", productionReady: true },
  { code: "es", name: "Español", direction: "ltr", productionReady: true },
  { code: "pt", name: "Português", direction: "ltr", productionReady: true },
];

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  "Business Owner": ["*"],
  Administrator: ["sales_documents.*", "products.*", "customers.*", "purchases.*", "inventory.*", "reports.*", "settings.*", "users.*"],
  Manager: ["sales_documents.*", "products.view", "customers.*", "purchases.*", "inventory.*", "reports.view", "approvals.*"],
  Accountant: ["sales_documents.view", "payments.*", "refunds.*", "accounts.*", "expenses.*", "reports.financial"],
  Cashier: ["sales_documents.create", "sales_documents.save_draft", "sales_documents.post", "payments.receive", "products.view", "customers.view", "customers.create", "shifts.open", "shifts.close"],
  Salesperson: ["sales_documents.create", "sales_documents.save_draft", "sales_documents.view", "products.view", "customers.view"],
  "Warehouse User": ["products.view", "inventory.view", "inventory.adjust", "inventory.transfer", "purchases.receive"],
  "Purchase User": ["products.view", "suppliers.*", "purchases.*", "inventory.view"],
  Pharmacist: ["sales_documents.*", "products.view", "inventory.view", "pharmacy.batch_manage", "pharmacy.restricted_products"],
  Waiter: ["restaurant.orders.create", "restaurant.orders.view", "sales_documents.create", "products.view"],
  "Kitchen User": ["restaurant.kitchen.view", "restaurant.kitchen.update"],
  "Factory Supervisor": ["manufacturing.*", "inventory.*", "products.view", "purchases.view"],
  Auditor: ["reports.*", "audit.view", "sales_documents.view", "purchases.view", "inventory.view", "accounts.view"],
  "Read Only": ["dashboard.view", "products.view", "customers.view", "sales_documents.view", "reports.view"],
};

function asObject(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function arrayOfStrings(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.map(item => String(item).trim()).filter(Boolean))] : []; }

export async function catalog() {
  const [plans, industries, currencies] = await Promise.all([
    prisma.subscriptionPlan.findMany({ where: { active: true }, include: { features: true }, orderBy: { sortOrder: "asc" } }),
    prisma.industryProfile.findMany({ where: { active: true }, include: { features: true }, orderBy: { sortOrder: "asc" } }),
    prisma.currency.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
  ]);
  return plain({ plans, industries, currencies, languages: SUPPORTED_LANGUAGES });
}

export async function context(businessId: string, userId: string | null) {
  const [business, user, access, entitlement, industry, currencies, rates, locale, tax, onboarding, announcements] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    userId ? prisma.user.findFirst({ where: { id: userId, businessId }, select: { id: true, name: true, email: true, preferredLanguage: true } }) : null,
    userId ? loadUserAccess(prisma, businessId, userId) : null,
    loadEntitlements(prisma, businessId),
    prisma.businessIndustry.findUnique({ where: { businessId }, include: { industry: { include: { features: true } } } }),
    prisma.businessCurrency.findMany({ where: { businessId, active: true }, include: { currency: true }, orderBy: [{ isBase: "desc" }, { currencyCode: "asc" }] }),
    prisma.exchangeRate.findMany({ where: { businessId }, orderBy: { effectiveAt: "desc" }, take: 50 }),
    prisma.businessLocale.findUnique({ where: { businessId } }),
    prisma.businessTaxSetting.findUnique({ where: { businessId } }),
    prisma.tenantOnboarding.findUnique({ where: { businessId } }),
    prisma.appSetting.findMany({ where: { businessId, key: { startsWith: "announcement." } }, orderBy: { updatedAt: "desc" }, take: 5 }),
  ]);
  const features = { ...entitlement.features };
  const industryFeatures = Object.fromEntries((industry?.industry?.features || []).map(feature => [feature.featureKey, { enabled: Boolean(feature.enabled), config: feature.config || null }]));
  return plain({ business, user, access: access ? { ...access, permissions: [...access.permissions] } : null, plan: entitlement.plan, subscription: entitlement.subscription, features, industryFeatures, limits: entitlement.limits, readOnly: entitlement.readOnly, industry, currencies, rates, locale, tax, onboarding, announcements, languages: SUPPORTED_LANGUAGES, platform: { version: process.env.APP_VERSION || "2026.07-global-saas", environment: process.env.NODE_ENV || "development", supportEmail: process.env.SUPPORT_EMAIL || null, supportUrl: process.env.SUPPORT_URL || null } });
}

export async function saveOnboarding(req: Request, businessId: string, userId: string | null, input: any) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId);
    requirePermission(access, "settings.onboarding", true);
    const current = await tx.tenantOnboarding.findUnique({ where: { businessId } });
    const currentAnswers = asObject(current?.answers);
    const answers = { ...currentAnswers, ...asObject(input?.answers || input) };
    const step = Math.min(20, Math.max(1, Number(input?.currentStep || input?.step || current?.currentStep || 1)));
    const completedSteps = arrayOfStrings(input?.completedSteps).map(Number).filter(value => value >= 1 && value <= 20);
    const row = await tx.tenantOnboarding.upsert({
      where: { businessId },
      create: { businessId, currentStep: step, completedSteps, state: "IN_PROGRESS", answers, sampleDataRequested: Boolean(input?.sampleDataRequested) },
      update: { currentStep: step, completedSteps, state: "IN_PROGRESS", answers, ...(input?.sampleDataRequested !== undefined ? { sampleDataRequested: Boolean(input.sampleDataRequested) } : {}) },
    });
    await tx.business.update({ where: { id: businessId }, data: { onboardingState: "IN_PROGRESS", onboardingStep: step } });
    await writeAudit(tx, req, { businessId, userId: access.userId, action: "onboarding.progress", entityType: "TenantOnboarding", entityId: row.id, after: { step, completedSteps } });
    return plain(row);
  });
}

export async function completeOnboarding(req: Request, businessId: string, userId: string | null, input: any) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId);
    requirePermission(access, "settings.onboarding", true);
    const existing = await tx.tenantOnboarding.findUnique({ where: { businessId } });
    const answers = { ...asObject(existing?.answers), ...asObject(input?.answers || input) };
    const businessName = requireText(answers.businessName, "Business name");
    const industryCode = requireText(answers.industryCode, "Industry").toLowerCase();
    const country = String(answers.country || "QA").toUpperCase();
    const timezone = requireText(answers.timezone || "Asia/Qatar", "Time zone");
    const baseCurrency = String(answers.baseCurrency || "QAR").toUpperCase();
    const language = String(answers.language || "en");
    if (!SUPPORTED_LANGUAGES.some(item => item.code === language)) throw new ApiError(400, "Unsupported language");
    const [industry, plan, currency] = await Promise.all([
      tx.industryProfile.findUnique({ where: { code: industryCode } }),
      tx.subscriptionPlan.findUnique({ where: { code: String(answers.planCode || "basic").toLowerCase() } }),
      tx.currency.findUnique({ where: { code: baseCurrency } }),
    ]);
    if (!industry?.active) throw new ApiError(400, "Selected industry is unavailable");
    if (!plan?.active) throw new ApiError(400, "Selected subscription plan is unavailable");
    if (!currency?.active) throw new ApiError(400, "Selected base currency is unavailable");

    const requestedCurrencies = [baseCurrency, ...arrayOfStrings(answers.additionalCurrencies).map(code => code.toUpperCase())];
    const enabledCurrencies = [...new Set(requestedCurrencies)];
    if (plan.maxCurrencies !== null && enabledCurrencies.length > Number(plan.maxCurrencies)) throw new ApiError(403, `The ${plan.name} plan allows ${plan.maxCurrencies} currencies`);
    const validCurrencyCount = await tx.currency.count({ where: { code: { in: enabledCurrencies }, active: true } });
    if (validCurrencyCount !== enabledCurrencies.length) throw new ApiError(400, "One or more selected currencies are invalid");

    const tax = asObject(answers.tax);
    await tx.business.update({ where: { id: businessId }, data: { name: businessName, country, timezone, currency: baseCurrency, defaultLanguage: language, numberLocale: String(answers.numberLocale || `${language}-${country}`), dateFormat: String(answers.dateFormat || "yyyy-MM-dd"), taxLabel: String(tax.label || "Tax"), onboardingState: "COMPLETED", onboardingStep: 20, onboardingCompletedAt: new Date(), subscriptionPlan: plan.code, subscriptionStatus: "TRIAL" } });
    await tx.user.update({ where: { id: access.userId }, data: { preferredLanguage: language } });
    await tx.businessIndustry.upsert({ where: { businessId }, create: { businessId, industryId: industry.id }, update: { industryId: industry.id } });
    await tx.businessLocale.upsert({ where: { businessId }, create: { businessId, countryCode: country, timezone, languageCode: language, dateFormat: String(answers.dateFormat || "yyyy-MM-dd"), numberLocale: String(answers.numberLocale || `${language}-${country}`) }, update: { countryCode: country, timezone, languageCode: language, dateFormat: String(answers.dateFormat || "yyyy-MM-dd"), numberLocale: String(answers.numberLocale || `${language}-${country}`) } });
    await tx.businessTaxSetting.upsert({ where: { businessId }, create: { businessId, taxSystem: String(tax.system || "none"), taxLabel: String(tax.label || "Tax"), registrationNumber: cleanString(tax.registrationNumber) || null, pricesIncludeTax: Boolean(tax.pricesIncludeTax), config: tax }, update: { taxSystem: String(tax.system || "none"), taxLabel: String(tax.label || "Tax"), registrationNumber: cleanString(tax.registrationNumber) || null, pricesIncludeTax: Boolean(tax.pricesIncludeTax), config: tax } });
    const setupSettings: Record<string, any> = {
      "company.profile": { name: businessName, logoUrl: cleanString(answers.logoUrl) || null, country, timezone },
      "invoice.template": { id: String(answers.invoiceTemplate || "standard"), industryCode },
      "documents.numbering": { invoicePrefix: String(answers.invoicePrefix || "INV"), quotationPrefix: String(answers.quotationPrefix || "QUO"), deliveryPrefix: String(answers.deliveryPrefix || "DN") },
    };
    for (const [key, value] of Object.entries(setupSettings)) await tx.appSetting.upsert({ where: { businessId_key: { businessId, key } }, create: { businessId, key, value }, update: { value } });
    await tx.businessCurrency.deleteMany({ where: { businessId } });
    await tx.businessCurrency.createMany({ data: enabledCurrencies.map(code => ({ businessId, currencyCode: code, isBase: code === baseCurrency, active: true })) });

    const branchName = String(answers.branchName || "Main Branch").trim();
    let branch = await tx.branch.findFirst({ where: { businessId, name: branchName } });
    if (!branch) branch = await tx.branch.create({ data: { businessId, name: branchName, code: "MAIN", country, type: industry.name, active: true } });
    const warehouseName = String(answers.warehouseName || "Main Warehouse").trim();
    let warehouse = await tx.warehouse.findFirst({ where: { businessId, name: warehouseName } });
    if (!warehouse) warehouse = await tx.warehouse.create({ data: { businessId, branchId: branch.id, name: warehouseName, code: "MAIN", active: true } });
    if (!await tx.counter.findFirst({ where: { businessId, branchId: branch.id } })) await tx.counter.create({ data: { businessId, branchId: branch.id, name: "Counter 1", code: "C1", status: "ACTIVE" } });
    if (!await tx.account.findFirst({ where: { businessId, name: "Main Cash" } })) await tx.account.create({ data: { businessId, name: "Main Cash", type: "cash", currency: baseCurrency, active: true } });
    for (const [name, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) await tx.role.upsert({ where: { businessId_name: { businessId, name } }, create: { businessId, name, isSystemRole: true, permissions }, update: { isSystemRole: true, permissions } });
    for (const documentType of ["INVOICE", "QUOTATION", "DELIVERY_NOTE"] as const) { const prefix = documentType === "INVOICE" ? String(answers.invoicePrefix || "INV") : documentType === "QUOTATION" ? String(answers.quotationPrefix || "QUO") : String(answers.deliveryPrefix || "DN"); const counter = await tx.documentCounter.findFirst({ where: { businessId, branchId: null, documentType } }); if (counter) await tx.documentCounter.update({ where: { id: counter.id }, data: { prefix } }); else await tx.documentCounter.create({ data: { businessId, branchId: null, documentType, prefix, nextNumber: 1, padding: 6 } }); }

    await tx.tenantSubscription.updateMany({ where: { businessId, isCurrent: true }, data: { isCurrent: false } });
    const trialEndsAt = new Date(Date.now() + 14 * 86400000);
    await tx.tenantSubscription.create({ data: { businessId, planId: plan.id, status: "TRIAL", billingCycle: String(answers.billingCycle || "MONTHLY").toUpperCase() === "ANNUAL" ? "ANNUAL" : "MONTHLY", startsAt: new Date(), trialEndsAt, currentPeriodStart: new Date(), currentPeriodEnd: trialEndsAt, isCurrent: true, provider: "manual" } });
    const sampleDataRequested = Boolean(answers.sampleDataRequested || existing?.sampleDataRequested);
    if (sampleDataRequested) {
      await tx.product.createMany({ data: [{ businessId, sku: "SAMPLE-001", name: "Sample Product", unit: "PCS", price: 10, costPrice: 6, currentStock: 20, openingStock: 20 }, { businessId, sku: "SAMPLE-002", name: "Sample Service", unit: "JOB", price: 50, costPrice: 0, currentStock: 0, openingStock: 0 }], skipDuplicates: true });
      if (!await tx.customer.findFirst({ where: { businessId, code: "SAMPLE-CUST" } })) await tx.customer.create({ data: { businessId, code: "SAMPLE-CUST", name: "Sample Customer", active: true } });
    }
    const onboarding = await tx.tenantOnboarding.upsert({ where: { businessId }, create: { businessId, currentStep: 20, completedSteps: Array.from({ length: 20 }, (_, index) => index + 1), state: "COMPLETED", answers, sampleDataRequested, completedAt: new Date() }, update: { currentStep: 20, completedSteps: Array.from({ length: 20 }, (_, index) => index + 1), state: "COMPLETED", answers, sampleDataRequested, completedAt: new Date() } });
    await writeAudit(tx, req, { businessId, userId: access.userId, action: "onboarding.completed", entityType: "TenantOnboarding", entityId: onboarding.id, after: { industryCode, planCode: plan.code, baseCurrency, language, sampleDataRequested } });
    return plain({ onboarding, branch, warehouse, trialEndsAt, redirect: "index.html" });
  }, { timeout: 30000 });
}

export async function saveExchangeRate(req: Request, businessId: string, userId: string | null, input: any) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId); requirePermission(access, "settings.currencies", true);
    const baseCode = String(input?.baseCode || "").toUpperCase(); const quoteCode = String(input?.quoteCode || "").toUpperCase(); const rate = Number(input?.rate);
    if (!baseCode || !quoteCode || baseCode === quoteCode || !Number.isFinite(rate) || rate <= 0) throw new ApiError(400, "Valid base currency, quote currency, and positive rate are required");
    const enabled = await tx.businessCurrency.count({ where: { businessId, currencyCode: { in: [baseCode, quoteCode] }, active: true } });
    if (enabled !== 2) throw new ApiError(400, "Both currencies must be enabled for this business");
    const row = await tx.exchangeRate.create({ data: { businessId, baseCode, quoteCode, rate, source: "manual", effectiveAt: input?.effectiveAt ? new Date(input.effectiveAt) : new Date() } });
    await writeAudit(tx, req, { businessId, userId: access.userId, action: "currency.rate.create", entityType: "ExchangeRate", entityId: row.id, after: row });
    return plain(row);
  });
}

export async function savePreferences(req: Request, businessId: string, userId: string | null, input: any) {
  const language = String(input?.language || "");
  if (!SUPPORTED_LANGUAGES.some(item => item.code === language)) throw new ApiError(400, "Unsupported language");
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId);
    const user = await tx.user.update({ where: { id: access.userId }, data: { preferredLanguage: language } });
    if (input?.setBusinessDefault) {
      requirePermission(access, "settings.localization", true);
      await tx.business.update({ where: { id: businessId }, data: { defaultLanguage: language } });
      await tx.businessLocale.upsert({ where: { businessId }, create: { businessId, languageCode: language }, update: { languageCode: language } });
    }
    await writeAudit(tx, req, { businessId, userId: access.userId, action: "localization.preference", entityType: "User", entityId: user.id, after: { preferredLanguage: language, setBusinessDefault: Boolean(input?.setBusinessDefault) } });
    return { preferredLanguage: language };
  });
}

export async function setBusinessCurrencies(req: Request, businessId: string, userId: string | null, input: any) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId); requirePermission(access, "settings.currencies", true);
    const baseCurrency = String(input?.baseCurrency || "").toUpperCase(); const codes = [...new Set([baseCurrency, ...arrayOfStrings(input?.currencies).map(code => code.toUpperCase())])].filter(Boolean);
    if (!baseCurrency || !codes.length) throw new ApiError(400, "Base currency and enabled currencies are required");
    const entitlement = await loadEntitlements(tx, businessId); const limit = entitlement.limits.currencies;
    if (limit !== null && codes.length > limit) throw new ApiError(403, `Current plan allows ${limit} currencies`, { upgradeRequired: true, limit });
    if (await tx.currency.count({ where: { code: { in: codes }, active: true } }) !== codes.length) throw new ApiError(400, "One or more currencies are invalid");
    await tx.businessCurrency.updateMany({ where: { businessId }, data: { isBase: false, active: false } });
    for (const code of codes) await tx.businessCurrency.upsert({ where: { businessId_currencyCode: { businessId, currencyCode: code } }, create: { businessId, currencyCode: code, isBase: code === baseCurrency, active: true }, update: { isBase: code === baseCurrency, active: true } });
    await tx.business.update({ where: { id: businessId }, data: { currency: baseCurrency } });
    await writeAudit(tx, req, { businessId, userId: access.userId, action: "currency.configuration", entityType: "BusinessCurrency", after: { baseCurrency, currencies: codes } });
    return plain(await tx.businessCurrency.findMany({ where: { businessId, active: true }, include: { currency: true }, orderBy: [{ isBase: "desc" }, { currencyCode: "asc" }] }));
  });
}

export async function listTaxRates(businessId: string) { return plain(await prisma.taxRate.findMany({ where: { businessId }, orderBy: [{ active: "desc" }, { name: "asc" }] })); }

export async function saveTaxRate(req: Request, businessId: string, userId: string | null, id: string | null, input: any) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId); requirePermission(access, "settings.tax", true);
    const rate = Number(input?.rate); if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new ApiError(400, "Tax rate must be between 0 and 100");
    const data = { name: requireText(input?.name, "Tax name"), label: String(input?.label || "Tax"), rate, inclusive: Boolean(input?.inclusive), zeroRated: Boolean(input?.zeroRated), active: input?.active === undefined ? true : Boolean(input.active) };
    const before = id ? await tx.taxRate.findFirst({ where: { id, businessId } }) : null; if (id && !before) throw new ApiError(404, "Tax rate not found");
    const row = id ? await tx.taxRate.update({ where: { id }, data }) : await tx.taxRate.create({ data: { businessId, ...data } });
    await writeAudit(tx, req, { businessId, userId: access.userId, action: id ? "tax_rate.update" : "tax_rate.create", entityType: "TaxRate", entityId: row.id, before: before || undefined, after: row }); return plain(row);
  });
}

export async function exportTenantConfig(businessId: string) {
  const [business, settings, industry, currencies, locale, tax, roles, counters] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true, legalName: true, slug: true, country: true, timezone: true, currency: true, defaultLanguage: true, dateFormat: true, numberLocale: true, taxLabel: true } }),
    prisma.appSetting.findMany({ where: { businessId }, select: { key: true, value: true } }),
    prisma.businessIndustry.findUnique({ where: { businessId }, include: { industry: { select: { code: true, name: true } } } }),
    prisma.businessCurrency.findMany({ where: { businessId }, select: { currencyCode: true, isBase: true, active: true } }),
    prisma.businessLocale.findUnique({ where: { businessId } }),
    prisma.businessTaxSetting.findUnique({ where: { businessId } }),
    prisma.role.findMany({ where: { businessId }, select: { name: true, description: true, permissions: true } }),
    prisma.documentCounter.findMany({ where: { businessId }, select: { branchId: true, documentType: true, prefix: true, nextNumber: true, padding: true } }),
  ]);
  return plain({ format: "axtor-tenant-config", version: 1, exportedAt: new Date().toISOString(), business, settings, industry, currencies, locale, tax, roles, counters, excludes: ["passwords", "tokens", "secrets", "payment credentials", "transaction records"] });
}
