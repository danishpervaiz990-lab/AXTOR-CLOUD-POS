import { prisma } from "../db/prisma.js";
import "../industry/activate-launch-ready-packs.js";
import { getIndustryPack, INDUSTRY_REGISTRY_VERSION, publicIndustryRegistry } from "../industry/registry.js";

const plans = [
  { code: "basic", name: "Basic", description: "For small shops and new businesses", maxUsers: 2, maxBranches: 1, maxWarehouses: 1, maxCurrencies: 1, maxLanguages: 2, supportLevel: "email", apiAccess: false, whiteLabel: false, sortOrder: 1, features: ["core.products", "core.customers", "sales.invoices", "sales.quotations", "sales.delivery_notes", "sales.payments", "sales.basic_returns", "inventory.basic", "dashboard.basic", "reports.daily_sales", "documents.pdf", "pwa"] },
  { code: "standard", name: "Standard", description: "For growing businesses", maxUsers: 10, maxBranches: 3, maxWarehouses: 5, maxCurrencies: 5, maxLanguages: 10, supportLevel: "standard", apiAccess: false, whiteLabel: false, sortOrder: 2, features: ["core.products", "core.customers", "sales.*", "inventory.*", "purchases.*", "suppliers.*", "expenses.*", "accounts.*", "salesmen.*", "promotions.basic", "loyalty.basic", "documents.multiple_templates", "currencies.multiple", "languages.multiple", "permissions.roles", "approvals.basic", "reports.standard", "barcode", "qr_scan", "pwa"] },
  { code: "professional", name: "Professional", description: "Best Value for established businesses", maxUsers: 50, maxBranches: 10, maxWarehouses: 25, maxCurrencies: 20, maxLanguages: 10, supportLevel: "priority", apiAccess: true, whiteLabel: false, isRecommended: true, sortOrder: 3, features: ["core.*", "sales.*", "inventory.*", "purchases.*", "suppliers.*", "expenses.*", "accounts.*", "salesmen.*", "promotions.*", "loyalty.*", "documents.*", "currencies.*", "languages.*", "permissions.*", "approvals.*", "reports.advanced", "audit.logs", "api.access", "backups.automated", "pharmacy.*", "restaurant.*", "manufacturing.light", "wholesale.*", "services.*", "pwa"] },
  { code: "enterprise", name: "Custom / Enterprise", description: "Quotation-based plan for large organisations and customised deployments", maxUsers: null, maxBranches: null, maxWarehouses: null, maxCurrencies: null, maxLanguages: null, supportLevel: "sla", apiAccess: true, whiteLabel: true, sortOrder: 4, features: ["*"] },
];

const industries = [
  ...publicIndustryRegistry().map((pack, index) => ({
    code: pack.code,
    name: pack.name,
    description: pack.description,
    sortOrder: index + 1,
    defaultSettings: pack.defaultSettings,
    features: [`industry.${pack.code}.*`, ...pack.modules.map(module => `industry.${pack.code}.${module}`)],
    terminology: pack.code === "gym"
      ? { product: "Service / Product", sale: "Member Invoice", customer: "Member" }
      : pack.code === "clinic"
        ? { product: "Service / Medicine", sale: "Patient Invoice", customer: "Patient" }
        : pack.code === "school"
          ? { product: "Fee / Item", sale: "Fee Invoice", customer: "Student / Guardian" }
          : pack.code === "pharmacy"
            ? { product: "Medicine", sale: "Dispensing Sale", customer: "Patient / Customer" }
            : pack.code === "restaurant"
              ? { product: "Menu Item", sale: "Restaurant Order", customer: "Guest / Customer" }
              : pack.code === "workshop"
                ? { product: "Part / Service", sale: "Workshop Invoice", customer: "Vehicle Owner" }
                : pack.code === "wholesale"
                  ? { product: "Trade Item", sale: "Sales Order", customer: "Trade Customer" }
                  : pack.code === "manufacturing"
                    ? { product: "Material / Finished Good", sale: "Customer Order", customer: "Customer" }
                    : { product: "Product", sale: "Sale", customer: "Customer" },
  })),
  (() => {
    const pack = getIndustryPack("hardware_paint");
    if (!pack) throw new Error("Legacy Hardware and Paint pack is missing");
    return {
      code: pack.code,
      name: pack.name,
      description: `${pack.description} Existing combined-pack tenants remain supported.`,
      sortOrder: 90,
      defaultSettings: pack.defaultSettings,
      features: [`industry.${pack.code}.*`, ...pack.modules.map(module => `industry.${pack.code}.${module}`)],
      terminology: { product: "Hardware / Paint Item", sale: "Trade Sale", customer: "Trade Customer" },
    };
  })(),
];

const currencyRows = [
  ["QAR", "Qatari Riyal", "ر.ق", 2], ["USD", "US Dollar", "$", 2], ["EUR", "Euro", "€", 2], ["GBP", "Pound Sterling", "£", 2], ["PKR", "Pakistani Rupee", "₨", 2], ["INR", "Indian Rupee", "₹", 2], ["AED", "UAE Dirham", "د.إ", 2], ["SAR", "Saudi Riyal", "ر.س", 2], ["KWD", "Kuwaiti Dinar", "د.ك", 3], ["BHD", "Bahraini Dinar", "د.ب", 3], ["OMR", "Omani Rial", "ر.ع.", 3], ["CNY", "Chinese Yuan", "¥", 2], ["JPY", "Japanese Yen", "¥", 0], ["CAD", "Canadian Dollar", "C$", 2], ["AUD", "Australian Dollar", "A$", 2], ["CHF", "Swiss Franc", "CHF", 2], ["ZAR", "South African Rand", "R", 2], ["NGN", "Nigerian Naira", "₦", 2], ["KES", "Kenyan Shilling", "KSh", 2], ["GHS", "Ghanaian Cedi", "₵", 2], ["EGP", "Egyptian Pound", "E£", 2], ["MAD", "Moroccan Dirham", "د.م.", 2], ["TRY", "Turkish Lira", "₺", 2], ["MYR", "Malaysian Ringgit", "RM", 2], ["SGD", "Singapore Dollar", "S$", 2], ["BDT", "Bangladeshi Taka", "৳", 2], ["LKR", "Sri Lankan Rupee", "Rs", 2], ["NPR", "Nepalese Rupee", "रू", 2], ["BRL", "Brazilian Real", "R$", 2], ["MXN", "Mexican Peso", "Mex$", 2],
] as const;

async function main() {
  for (const planInput of plans) {
    const { features, ...data } = planInput;
    const plan = await prisma.subscriptionPlan.upsert({ where: { code: data.code }, create: data, update: data });
    for (const featureKey of features) await prisma.planFeature.upsert({ where: { planId_featureKey: { planId: plan.id, featureKey } }, create: { planId: plan.id, featureKey, enabled: true }, update: { enabled: true } });
  }
  for (const industryInput of industries) {
    const { features, terminology, ...data } = industryInput;
    const industry = await prisma.industryProfile.upsert({ where: { code: data.code }, create: { ...data, active: true, registryVersion: INDUSTRY_REGISTRY_VERSION, defaultTerminology: terminology }, update: { ...data, active: true, registryVersion: INDUSTRY_REGISTRY_VERSION, defaultTerminology: terminology } });
    for (const featureKey of features) await prisma.industryFeature.upsert({ where: { industryId_featureKey: { industryId: industry.id, featureKey } }, create: { industryId: industry.id, featureKey, enabled: true }, update: { enabled: true } });
  }
  for (const [code, name, symbol, decimalPrecision] of currencyRows) await prisma.currency.upsert({ where: { code }, create: { code, name, symbol, decimalPrecision }, update: { name, symbol, decimalPrecision, active: true } });
  const basic = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: "basic" } });
  const professional = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: "professional" } });
  const businesses = await prisma.business.findMany({ select: { id: true, currency: true, status: true, trialEndsAt: true, subscriptionPlan: true } });
  for (const business of businesses) {
    const baseCode = currencyRows.some(row => row[0] === String(business.currency || "QAR").toUpperCase()) ? String(business.currency || "QAR").toUpperCase() : "QAR";
    await prisma.businessCurrency.updateMany({ where: { businessId: business.id, isBase: true, currencyCode: { not: baseCode } }, data: { isBase: false } });
    await prisma.businessCurrency.upsert({ where: { businessId_currencyCode: { businessId: business.id, currencyCode: baseCode } }, create: { businessId: business.id, currencyCode: baseCode, isBase: true, active: true }, update: { isBase: true, active: true } });
    const legacyFoundation = String(business.subscriptionPlan || "").toLowerCase() === "foundation";
    const targetPlan = legacyFoundation ? professional : basic;
    const currentSubscription = await prisma.tenantSubscription.findFirst({ where: { businessId: business.id, isCurrent: true } });
    if (!currentSubscription) {
      const trialEndsAt = business.trialEndsAt || new Date(Date.now() + 14 * 86400000);
      const status = business.status === "TRIAL" ? "TRIAL" : business.status === "SUSPENDED" ? "SUSPENDED" : business.status === "CANCELLED" ? "CANCELLED" : "ACTIVE";
      await prisma.tenantSubscription.create({ data: { businessId: business.id, planId: targetPlan.id, status, billingCycle: "MONTHLY", startsAt: new Date(), trialEndsAt: business.status === "TRIAL" ? trialEndsAt : null, currentPeriodStart: new Date(), currentPeriodEnd: business.status === "TRIAL" ? trialEndsAt : new Date(Date.now() + 30 * 86400000), isCurrent: true, provider: "manual" } });
    } else if (legacyFoundation && currentSubscription.planId === basic.id) {
      await prisma.tenantSubscription.update({ where: { id: currentSubscription.id }, data: { planId: professional.id } });
    }
  }
  console.log(`Commercial catalog ready: ${plans.length} plans, ${industries.length} industries, ${currencyRows.length} currencies.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
