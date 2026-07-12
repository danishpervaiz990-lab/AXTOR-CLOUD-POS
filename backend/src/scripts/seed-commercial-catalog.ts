import { prisma } from "../db/prisma.js";

const plans = [
  { code: "basic", name: "Basic", description: "For small shops and new businesses", maxUsers: 2, maxBranches: 1, maxWarehouses: 1, maxCurrencies: 1, maxLanguages: 2, supportLevel: "email", apiAccess: false, whiteLabel: false, sortOrder: 1, features: ["core.products", "core.customers", "sales.invoices", "sales.quotations", "sales.delivery_notes", "sales.payments", "sales.basic_returns", "inventory.basic", "dashboard.basic", "reports.daily_sales", "documents.pdf", "pwa"] },
  { code: "standard", name: "Standard", description: "For growing businesses", maxUsers: 10, maxBranches: 3, maxWarehouses: 5, maxCurrencies: 5, maxLanguages: 10, supportLevel: "standard", apiAccess: false, whiteLabel: false, sortOrder: 2, features: ["core.products", "core.customers", "sales.*", "inventory.*", "purchases.*", "suppliers.*", "expenses.*", "accounts.*", "salesmen.*", "promotions.basic", "loyalty.basic", "documents.multiple_templates", "currencies.multiple", "languages.multiple", "permissions.roles", "approvals.basic", "reports.standard", "barcode", "qr_scan", "pwa"] },
  { code: "professional", name: "Professional", description: "Best Value for established businesses", maxUsers: 50, maxBranches: 10, maxWarehouses: 25, maxCurrencies: 20, maxLanguages: 10, supportLevel: "priority", apiAccess: true, whiteLabel: false, isRecommended: true, sortOrder: 3, features: ["core.*", "sales.*", "inventory.*", "purchases.*", "suppliers.*", "expenses.*", "accounts.*", "salesmen.*", "promotions.*", "loyalty.*", "documents.*", "currencies.*", "languages.*", "permissions.*", "approvals.*", "reports.advanced", "audit.logs", "api.access", "backups.automated", "pharmacy.*", "restaurant.*", "manufacturing.light", "wholesale.*", "services.*", "pwa"] },
  { code: "enterprise", name: "Custom / Enterprise", description: "Quotation-based plan for large organisations and customised deployments", maxUsers: null, maxBranches: null, maxWarehouses: null, maxCurrencies: null, maxLanguages: null, supportLevel: "sla", apiAccess: true, whiteLabel: true, sortOrder: 4, features: ["*"] },
];

const industries = [
  { code: "retail", name: "Retail", description: "Retail, grocery, paint, hardware, electronics and general trading", features: ["retail.fast_checkout", "barcode", "qr_scan", "retail.variants", "promotions.basic", "loyalty.basic", "retail.held_sales", "sales.split_payments", "inventory.transfers", "shifts"], terminology: { product: "Product", sale: "Sale", customer: "Customer" } },
  { code: "pharmacy", name: "Pharmacy", description: "Medicine inventory and transaction management only", features: ["pharmacy.batch_tracking", "pharmacy.expiry", "pharmacy.fefo", "pharmacy.recall", "pharmacy.restricted_products", "pharmacy.prescription_reference"], terminology: { product: "Medicine", sale: "Dispensing Sale", customer: "Customer" } },
  { code: "restaurant", name: "Restaurant & Café", description: "Dine-in, takeaway, delivery and kitchen operations", features: ["restaurant.orders", "restaurant.tables", "restaurant.kitchen", "restaurant.modifiers", "restaurant.split_bill", "restaurant.recipes", "restaurant.wastage", "restaurant.z_report"], terminology: { product: "Menu Item", sale: "Order", customer: "Guest" } },
  { code: "manufacturing", name: "Factory & Light Manufacturing", description: "Practical light manufacturing for small and medium businesses", features: ["manufacturing.materials", "manufacturing.bom", "manufacturing.production_orders", "manufacturing.work_orders", "manufacturing.consumption", "manufacturing.output", "manufacturing.wastage", "manufacturing.costing", "manufacturing.quality"], terminology: { product: "Item", sale: "Dispatch", customer: "Customer" } },
  { code: "wholesale", name: "Wholesale & Distribution", description: "Wholesale pricing, credit, delivery and multi-warehouse distribution", features: ["wholesale.price_lists", "wholesale.customer_pricing", "wholesale.moq", "wholesale.unit_conversion", "wholesale.routes", "wholesale.dispatch", "wholesale.bulk_invoicing", "inventory.multi_warehouse", "salesmen.commission"], terminology: { product: "Item", sale: "Invoice", customer: "Trade Customer" } },
  { code: "services", name: "Service Business", description: "Repair, workshop, salon, maintenance and professional services", features: ["services.job_cards", "services.assets", "services.technicians", "services.appointments", "services.estimates", "services.parts", "services.warranty", "services.history"], terminology: { product: "Service / Part", sale: "Service Invoice", customer: "Client" } },
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
    const industry = await prisma.industryProfile.upsert({ where: { code: data.code }, create: { ...data, defaultTerminology: terminology }, update: { ...data, defaultTerminology: terminology } });
    for (const featureKey of features) await prisma.industryFeature.upsert({ where: { industryId_featureKey: { industryId: industry.id, featureKey } }, create: { industryId: industry.id, featureKey, enabled: true }, update: { enabled: true } });
  }
  for (const [code, name, symbol, decimalPrecision] of currencyRows) await prisma.currency.upsert({ where: { code }, create: { code, name, symbol, decimalPrecision }, update: { name, symbol, decimalPrecision, active: true } });
  const basic = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { code: "basic" } });
  const businesses = await prisma.business.findMany({ select: { id: true, currency: true, status: true, trialEndsAt: true } });
  for (const business of businesses) {
    const baseCode = currencyRows.some(row => row[0] === String(business.currency || "QAR").toUpperCase()) ? String(business.currency || "QAR").toUpperCase() : "QAR";
    await prisma.businessCurrency.updateMany({ where: { businessId: business.id, isBase: true, currencyCode: { not: baseCode } }, data: { isBase: false } });
    await prisma.businessCurrency.upsert({ where: { businessId_currencyCode: { businessId: business.id, currencyCode: baseCode } }, create: { businessId: business.id, currencyCode: baseCode, isBase: true, active: true }, update: { isBase: true, active: true } });
    if (!await prisma.tenantSubscription.findFirst({ where: { businessId: business.id, isCurrent: true } })) {
      const trialEndsAt = business.trialEndsAt || new Date(Date.now() + 14 * 86400000);
      const status = business.status === "TRIAL" ? "TRIAL" : business.status === "SUSPENDED" ? "SUSPENDED" : business.status === "CANCELLED" ? "CANCELLED" : "ACTIVE";
      await prisma.tenantSubscription.create({ data: { businessId: business.id, planId: basic.id, status, billingCycle: "MONTHLY", startsAt: new Date(), trialEndsAt: business.status === "TRIAL" ? trialEndsAt : null, currentPeriodStart: new Date(), currentPeriodEnd: business.status === "TRIAL" ? trialEndsAt : new Date(Date.now() + 30 * 86400000), isCurrent: true, provider: "manual" } });
    }
  }
  console.log(`Commercial catalog ready: ${plans.length} plans, ${industries.length} industries, ${currencyRows.length} currencies.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
