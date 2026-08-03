import crypto from "node:crypto";
import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { ONBOARDING_READY_INDUSTRY_CODES, industryLaunchReadiness } from "../industry/activate-launch-ready-packs.js";
import { getIndustryPack, INDUSTRY_REGISTRY_VERSION, publicIndustryRegistry, type IndustryPack } from "../industry/registry.js";
import { findSystemRoleDefinition } from "./system-role-definitions.js";
import { hashPassword } from "../utils/password.js";
import { plain } from "../utils/http.js";

export class PublicCatalogError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

const onboardingCodes = new Set<string>(ONBOARDING_READY_INDUSTRY_CODES);
const supportedLanguages = new Set(["en", "ar", "zh-CN", "hi", "ur", "hinglish", "sw", "fr", "es", "pt"]);
const allowedTaxSystems = new Set(["none", "vat", "gst", "sales_tax"]);
const allowedBillingCycles = new Set(["MONTHLY", "ANNUAL"]);
const allowedPrintProfiles = new Set(["a4", "80mm", "58mm"]);

type RoleProvisioningDb = Pick<Prisma.TransactionClient, "role">;
type SettingProvisioningDb = Pick<Prisma.TransactionClient, "industrySetting">;

function requiredText(value: unknown, label: string, max = 160): string {
  const text = String(value ?? "").trim();
  if (!text) throw new PublicCatalogError(400, "VALIDATION_ERROR", `${label} is required`);
  if (text.length > max) throw new PublicCatalogError(400, "VALIDATION_ERROR", `${label} is too long`);
  return text;
}

function optionalText(value: unknown, max = 160): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > max) throw new PublicCatalogError(400, "VALIDATION_ERROR", "A supplied value is too long");
  return text;
}

function normalizeEmail(value: unknown): string {
  const email = requiredText(value, "Owner email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PublicCatalogError(400, "VALIDATION_ERROR", "Enter a valid owner email address");
  return email;
}

function validatePassword(value: unknown): string {
  const password = String(value ?? "");
  if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new PublicCatalogError(400, "WEAK_PASSWORD", "Password must be 12–128 characters and include uppercase, lowercase, number, and symbol");
  }
  return password;
}

function slugBase(name: string): string {
  const value = name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (value || "business").slice(0, 42);
}

function requestFingerprint(input: Record<string, unknown>): string {
  const safe = {
    businessName: input.businessName,
    ownerName: input.ownerName,
    email: String(input.email || "").toLowerCase(),
    country: input.country,
    timezone: input.timezone,
    baseCurrency: input.baseCurrency,
    language: input.language,
    industryCode: input.industryCode,
    planCode: input.planCode,
    billingCycle: input.billingCycle,
    firstBranch: input.firstBranch,
    firstWarehouse: input.firstWarehouse,
    firstCounter: input.firstCounter,
    taxSystem: input.taxSystem,
    taxLabel: input.taxLabel,
    taxRegistrationNumber: input.taxRegistrationNumber,
    invoicePrefix: input.invoicePrefix,
    printProfile: input.printProfile,
    pricesIncludeTax: input.pricesIncludeTax === true,
    sampleDataRequested: input.sampleDataRequested === true,
  };
  return crypto.createHash("sha256").update(JSON.stringify(safe)).digest("hex");
}

function publicPack(pack: IndustryPack) {
  const readiness = industryLaunchReadiness(pack);
  const canRegister = onboardingCodes.has(pack.code) && readiness.ready;
  return {
    code: pack.code,
    name: pack.name,
    description: pack.description,
    icon: pack.icon || "bi-grid",
    suitableFor: pack.suitableFor || [],
    highlights: pack.catalogueHighlights || pack.modules.slice(0, 6),
    modules: pack.modules,
    dashboardWidgets: pack.dashboardWidgets,
    reports: pack.reports,
    operationalStatus: pack.operationalStatus,
    canRegister,
    availabilityMessage: canRegister ? "Available for production onboarding" : "Onboarding is temporarily unavailable because launch-readiness validation failed",
    readinessErrors: canRegister ? [] : readiness.errors,
  };
}

export async function catalogue() {
  const [plans, currencies] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { code: true, name: true, description: true, isRecommended: true, monthlyPrice: true, annualPrice: true, priceCurrency: true, maxUsers: true, maxBranches: true, maxWarehouses: true, maxCurrencies: true, maxLanguages: true, supportLevel: true, apiAccess: true, whiteLabel: true },
    }),
    prisma.currency.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { code: true, name: true, symbol: true, decimalPrecision: true } }),
  ]);
  return plain({
    registryVersion: INDUSTRY_REGISTRY_VERSION,
    industries: publicIndustryRegistry().map(publicPack),
    plans,
    currencies,
    languages: [
      { code: "en", name: "English" }, { code: "ar", name: "العربية" }, { code: "zh-CN", name: "简体中文" },
      { code: "hi", name: "हिन्दी" }, { code: "ur", name: "اردو" }, { code: "hinglish", name: "Hinglish" },
      { code: "sw", name: "Kiswahili" }, { code: "fr", name: "Français" }, { code: "es", name: "Español" }, { code: "pt", name: "Português" },
    ],
  });
}

export function industryDetail(codeInput: unknown) {
  const code = String(codeInput || "").trim().toLowerCase();
  const pack = publicIndustryRegistry().find(item => item.code === code);
  if (!pack) throw new PublicCatalogError(404, "INDUSTRY_NOT_FOUND", "Industry solution was not found");
  return { registryVersion: INDUSTRY_REGISTRY_VERSION, ...publicPack(pack) };
}

function assertPackReady(industryCode: string): IndustryPack {
  const pack = getIndustryPack(industryCode);
  if (!pack || !publicIndustryRegistry().some(item => item.code === industryCode)) throw new PublicCatalogError(400, "INVALID_INDUSTRY", "Selected industry is unavailable");
  const readiness = industryLaunchReadiness(pack);
  if (!onboardingCodes.has(industryCode) || !readiness.ready) {
    throw new PublicCatalogError(409, "INDUSTRY_NOT_LAUNCH_READY", `${pack.name} cannot be onboarded until all launch-readiness checks pass`, { readinessErrors: readiness.errors });
  }
  return pack;
}

async function createIndustryRoles(db: RoleProvisioningDb, businessId: string, pack: IndustryPack): Promise<number> {
  let count = 0;
  for (const [name, permissions] of Object.entries(pack.defaultRoles)) {
    const roleName = name.trim();
    const canonical = findSystemRoleDefinition(roleName);
    const uniquePermissions = [...new Set([
      ...permissions,
      ...(canonical?.permissions || []),
    ].map(item => String(item).trim()).filter(Boolean))];
    if (!roleName || roleName.toLowerCase() === "owner" || !uniquePermissions.length) continue;
    await db.role.create({ data: { businessId, name: roleName, description: `Default ${pack.name} operational role`, isSystemRole: true, permissions: uniquePermissions } });
    count += 1;
  }
  return count;
}

async function createIndustrySettings(db: SettingProvisioningDb, businessId: string, pack: IndustryPack, printProfile: string): Promise<void> {
  const values: Array<[string, Prisma.InputJsonValue]> = [
    ["industry.defaults", pack.defaultSettings as Prisma.InputJsonValue],
    ["industry.modules", { modules: pack.modules, sidebarOrder: pack.sidebarOrder, dashboardWidgets: pack.dashboardWidgets } as Prisma.InputJsonValue],
    ["industry.reports", { reports: pack.reports } as Prisma.InputJsonValue],
    ["industry.printing", { defaultProfile: printProfile, fields: pack.printFields } as Prisma.InputJsonValue],
    ["industry.forms", { entities: pack.entities.map(entity => ({ type: entity.type, label: entity.label, pluralLabel: entity.pluralLabel, icon: entity.icon, permission: entity.permission, statuses: entity.statuses, fields: entity.fields })) } as Prisma.InputJsonValue],
    ["industry.launch", { registryVersion: INDUSTRY_REGISTRY_VERSION, operationalStatus: pack.operationalStatus, registrationEnabled: pack.registrationEnabled, activatedAt: new Date().toISOString() } as Prisma.InputJsonValue],
  ];
  for (const [key, value] of values) await db.industrySetting.create({ data: { businessId, key, value } });
}

async function cleanupProvisioningBusiness(businessId: string): Promise<boolean> {
  try {
    await prisma.business.deleteMany({ where: { id: businessId } });
    return true;
  } catch (cleanupError) {
    console.error("Tenant provisioning cleanup failed", { businessId, cleanupError });
    return false;
  }
}

export async function register(req: Request, input: Record<string, unknown>) {
  const idempotencyKey = requiredText(req.header("Idempotency-Key") || req.header("X-Idempotency-Key"), "Idempotency-Key header", 120);
  if (!/^[A-Za-z0-9._:-]{16,120}$/.test(idempotencyKey)) throw new PublicCatalogError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 16–120 safe characters");

  const fingerprint = requestFingerprint(input);
  const previous = await prisma.tenantProvisioningRun.findUnique({ where: { idempotencyKey } });
  if (previous) {
    if (previous.requestHash !== fingerprint) throw new PublicCatalogError(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for different registration data");
    return plain(previous.response);
  }

  const businessName = requiredText(input.businessName, "Business name", 120);
  const ownerName = requiredText(input.ownerName, "Owner name", 120);
  const email = normalizeEmail(input.email);
  const password = validatePassword(input.password);
  const country = requiredText(input.country, "Country", 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new PublicCatalogError(400, "VALIDATION_ERROR", "Country must be a two-letter ISO code");
  const timezone = requiredText(input.timezone, "Timezone", 80);
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { throw new PublicCatalogError(400, "VALIDATION_ERROR", "Timezone is invalid"); }
  const baseCurrency = requiredText(input.baseCurrency, "Base currency", 3).toUpperCase();
  const language = requiredText(input.language, "Language", 12);
  if (!supportedLanguages.has(language)) throw new PublicCatalogError(400, "VALIDATION_ERROR", "Language is unsupported");
  const industryCode = requiredText(input.industryCode, "Industry", 40).toLowerCase();
  const planCode = requiredText(input.planCode, "Subscription plan", 40).toLowerCase();
  const billingCycle = requiredText(input.billingCycle || "MONTHLY", "Billing cycle", 10).toUpperCase();
  if (!allowedBillingCycles.has(billingCycle)) throw new PublicCatalogError(400, "VALIDATION_ERROR", "Billing cycle is unsupported");
  const firstBranch = requiredText(input.firstBranch || "Main Branch", "First branch", 120);
  const firstWarehouse = requiredText(input.firstWarehouse || "Main Warehouse", "First warehouse", 120);
  const firstCounter = requiredText(input.firstCounter || "Counter 1", "First counter", 120);
  const taxSystem = requiredText(input.taxSystem || "none", "Tax system", 20).toLowerCase();
  if (!allowedTaxSystems.has(taxSystem)) throw new PublicCatalogError(400, "VALIDATION_ERROR", "Tax system is unsupported");
  const taxLabel = requiredText(input.taxLabel || "Tax", "Tax label", 30);
  const taxRegistrationNumber = optionalText(input.taxRegistrationNumber, 80);
  const invoicePrefix = requiredText(input.invoicePrefix || "INV", "Invoice prefix", 8).toUpperCase();
  if (!/^[A-Z0-9-]{1,8}$/.test(invoicePrefix)) throw new PublicCatalogError(400, "VALIDATION_ERROR", "Invoice prefix contains unsupported characters");
  const printProfile = requiredText(input.printProfile || "a4", "Print profile", 12).toLowerCase();
  if (!allowedPrintProfiles.has(printProfile)) throw new PublicCatalogError(400, "VALIDATION_ERROR", "Print profile is unsupported");
  if (input.acceptTerms !== true || input.acceptPrivacy !== true) throw new PublicCatalogError(400, "CONSENT_REQUIRED", "Terms and privacy acknowledgement are required");

  const pack = assertPackReady(industryCode);
  const [industry, plan, currency] = await Promise.all([
    prisma.industryProfile.findUnique({ where: { code: industryCode } }),
    prisma.subscriptionPlan.findUnique({ where: { code: planCode } }),
    prisma.currency.findUnique({ where: { code: baseCurrency } }),
  ]);
  if (!industry?.active) throw new PublicCatalogError(409, "CATALOG_NOT_SEEDED", "Selected industry is not active in the deployed catalogue");
  if (!plan?.active) throw new PublicCatalogError(409, "PLAN_UNAVAILABLE", "Selected subscription plan is unavailable");
  if (!currency?.active) throw new PublicCatalogError(409, "CURRENCY_UNAVAILABLE", "Selected currency is unavailable");

  const ownerPasswordHash = hashPassword(password);
  const slug = `${slugBase(businessName)}-${crypto.randomBytes(3).toString("hex")}`;
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 86400000);
  const ipAddress = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim() || null;
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 500) || null;
  let createdBusinessId: string | null = null;

  try {
    // Railway's pooled production connection cannot reliably start Prisma
    // interactive transactions. Provision with ordinary queries and compensate
    // by cascade-deleting the temporary Business if any dependent write fails.
    let business = await prisma.business.create({ data: { name: businessName, slug, status: "PROVISIONING", country, timezone, currency: baseCurrency, subscriptionPlan: plan.code, subscriptionStatus: "TRIAL", trialEndsAt, defaultLanguage: language, onboardingState: "IN_PROGRESS", onboardingStep: 0, taxLabel } });
    createdBusinessId = business.id;

    const branch = await prisma.branch.create({ data: { businessId: business.id, name: firstBranch, code: "MAIN", country, type: pack.name } });
    const warehouse = await prisma.warehouse.create({ data: { businessId: business.id, branchId: branch.id, name: firstWarehouse, code: "MAIN" } });
    const ownerRole = await prisma.role.create({ data: { businessId: business.id, name: "Owner", description: "Business owner with full tenant access", isSystemRole: true, permissions: ["*"] } });
    const rolePresetCount = await createIndustryRoles(prisma, business.id, pack);
    const owner = await prisma.user.create({ data: { businessId: business.id, branchId: branch.id, name: ownerName, email, passwordHash: ownerPasswordHash, preferredLanguage: language, status: "ACTIVE" } });
    await prisma.userRole.create({ data: { businessId: business.id, userId: owner.id, roleId: ownerRole.id } });
    const counter = await prisma.counter.create({ data: { businessId: business.id, branchId: branch.id, name: firstCounter, code: "POS-1", cashierUserId: owner.id } });
    await prisma.businessIndustry.create({ data: { businessId: business.id, industryId: industry.id, provisioningState: "completed", registryVersion: INDUSTRY_REGISTRY_VERSION } });
    await prisma.tenantSubscription.create({ data: { businessId: business.id, planId: plan.id, status: "TRIAL", billingCycle: billingCycle as "MONTHLY" | "ANNUAL", startsAt: now, trialEndsAt, currentPeriodStart: now, currentPeriodEnd: trialEndsAt, isCurrent: true, provider: "manual" } });
    await prisma.businessCurrency.create({ data: { businessId: business.id, currencyCode: baseCurrency, isBase: true, active: true } });
    await prisma.businessTaxSetting.create({ data: { businessId: business.id, taxSystem, taxLabel, registrationNumber: taxRegistrationNumber, pricesIncludeTax: input.pricesIncludeTax === true } });
    await prisma.businessLocale.create({ data: { businessId: business.id, countryCode: country, languageCode: language, timezone, dateFormat: String(input.dateFormat || "yyyy-MM-dd"), numberLocale: String(input.numberLocale || "en-QA") } });
    await prisma.tenantOnboarding.create({ data: { businessId: business.id, currentStep: 18, completedSteps: Array.from({ length: 18 }, (_, index) => index + 1), state: "COMPLETED", answers: { businessName, ownerName, email, country, timezone, baseCurrency, language, industryCode, planCode, billingCycle, branchName: firstBranch, warehouseName: firstWarehouse, counterName: firstCounter, taxSystem, printProfile, sampleDataRequested: input.sampleDataRequested === true }, sampleDataRequested: input.sampleDataRequested === true, completedAt: now } });
    await createIndustrySettings(prisma, business.id, pack, printProfile);
    await prisma.documentCounter.createMany({ data: [
      { businessId: business.id, branchId: branch.id, documentType: "INVOICE", prefix: invoicePrefix, nextNumber: 1, padding: 6 },
      { businessId: business.id, branchId: branch.id, documentType: "QUOTATION", prefix: "QUO", nextNumber: 1, padding: 6 },
      { businessId: business.id, branchId: branch.id, documentType: "DELIVERY_NOTE", prefix: "DN", nextNumber: 1, padding: 6 },
    ] });

    const profileRows = [
      { code: "invoice-a4", name: "A4 Invoice", paperSize: "A4", widthMm: 210, heightMm: 297 },
      { code: "receipt-80", name: "80 mm Receipt", paperSize: "THERMAL", widthMm: 80, heightMm: null },
      { code: "receipt-58", name: "58 mm Receipt", paperSize: "THERMAL", widthMm: 58, heightMm: null },
    ];
    for (const profile of profileRows) {
      await prisma.printProfile.create({ data: { businessId: business.id, code: profile.code, name: profile.name, documentType: "invoice", paperSize: profile.paperSize, widthMm: profile.widthMm, heightMm: profile.heightMm, isDefault: profile.code === (printProfile === "80mm" ? "receipt-80" : printProfile === "58mm" ? "receipt-58" : "invoice-a4"), config: { fields: pack.printFields, browserPrint: true, industryCode: pack.code }, createdByUserId: owner.id, updatedByUserId: owner.id } });
    }
    for (const rule of pack.notificationRules) {
      await prisma.notificationRule.create({ data: { businessId: business.id, code: rule.code, name: rule.code.split("-").map(part => part[0]?.toUpperCase() + part.slice(1)).join(" "), eventType: rule.eventType, channels: ["in_app"], schedule: rule.daysBefore ? { daysBefore: rule.daysBefore } : undefined, conditions: {}, template: { title: pack.name, body: `Action required for ${rule.eventType}` }, createdByUserId: owner.id, updatedByUserId: owner.id } });
    }

    const launchEvidence = { industryCode, planCode, registryVersion: INDUSTRY_REGISTRY_VERSION, rolePresetCount, moduleCount: pack.modules.length, reportCount: pack.reports.length, formSchemaCount: pack.entities.length, notificationRuleCount: pack.notificationRules.length, printFieldCount: pack.printFields.length, sampleDataRequested: input.sampleDataRequested === true };
    await prisma.auditLog.create({ data: { businessId: business.id, userId: owner.id, action: "tenant.provisioned", entityType: "Business", entityId: business.id, after: launchEvidence, ipAddress, userAgent } });

    business = await prisma.business.update({ where: { id: business.id }, data: { status: "TRIAL", onboardingState: "COMPLETED", onboardingStep: 18, onboardingCompletedAt: now } });
    const response = {
      business: { id: business.id, name: business.name, slug: business.slug, status: business.status, timezone: business.timezone, currency: business.currency, industryCode: pack.code, industry: { code: pack.code, name: pack.name } },
      owner: { email: owner.email },
      industry: { code: pack.code, name: pack.name, registryVersion: INDUSTRY_REGISTRY_VERSION, operationalStatus: pack.operationalStatus },
      plan: { code: plan.code, name: plan.name },
      provisioning: { state: "completed", branchId: branch.id, warehouseId: warehouse.id, counterId: counter.id, rolePresetCount, moduleCount: pack.modules.length, reportCount: pack.reports.length, formSchemaCount: pack.entities.length },
      next: { page: "router.html", industryCode: pack.code },
    };
    await prisma.tenantProvisioningRun.create({ data: { businessId: business.id, idempotencyKey, requestHash: fingerprint, status: "completed", response } });
    createdBusinessId = null;
    return plain(response);
  } catch (error: any) {
    const businessIdToCleanup = createdBusinessId;
    const cleanupSucceeded = !businessIdToCleanup || await cleanupProvisioningBusiness(businessIdToCleanup);

    if (error?.code === "P2002") {
      const retry = await prisma.tenantProvisioningRun.findUnique({ where: { idempotencyKey } });
      if (retry && retry.requestHash === fingerprint) return plain(retry.response);
      if (!cleanupSucceeded) throw new PublicCatalogError(500, "PROVISIONING_CLEANUP_FAILED", "Workspace provisioning failed and automatic cleanup could not complete", { cleanupRequired: true });
      throw new PublicCatalogError(409, "REGISTRATION_CONFLICT", "A registration with the same unique information already exists");
    }

    if (!cleanupSucceeded) throw new PublicCatalogError(500, "PROVISIONING_CLEANUP_FAILED", "Workspace provisioning failed and automatic cleanup could not complete", { cleanupRequired: true });
    throw error;
  }
}
