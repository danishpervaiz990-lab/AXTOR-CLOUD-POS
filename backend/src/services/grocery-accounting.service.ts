function json(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}
function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function settingAccountId(tx: any, businessId: string, keys: string[]) {
  const rows = await tx.appSetting.findMany({ where: { businessId, key: { in: keys } } });
  for (const row of rows) {
    const value = row.value;
    if (typeof value === "string" && value.trim()) return value.trim();
    const obj = json(value);
    const id = String(obj.accountId || obj.id || obj.value || "").trim();
    if (id) return id;
  }
  return null;
}

async function resolveAccount(tx: any, businessId: string, currency: string, input: {
  settingKeys: string[];
  systemCode: string;
  name: string;
  type: string;
  nameMatches: string[];
}) {
  const configuredId = await settingAccountId(tx, businessId, input.settingKeys);
  if (configuredId) {
    const configured = await tx.account.findFirst({ where: { id: configuredId, businessId, active: true } });
    if (!configured) throw new Error(`Configured ${input.name} account is missing or inactive`);
    return configured;
  }

  const accounts = await tx.account.findMany({ where: { businessId, active: true } });
  const bySystemCode = accounts.find((a: any) => String(json(a.metadata).systemCode || "").toLowerCase() === input.systemCode);
  if (bySystemCode) return bySystemCode;
  const byName = accounts.find((a: any) => input.nameMatches.includes(String(a.name || "").trim().toLowerCase()));
  if (byName) return byName;

  return tx.account.create({
    data: {
      businessId,
      name: input.name,
      type: input.type,
      currency,
      openingBalance: 0,
      currentBalance: 0,
      active: true,
      metadata: { systemCode: input.systemCode, createdBy: "grocery_purchase_posting", managedFallback: true },
    },
  });
}

export async function postGroceryPurchaseAccounting(tx: any, input: {
  businessId: string;
  userId: string;
  purchaseId: string;
  purchaseNo: string;
  purchaseDate: Date;
  amount: number;
}) {
  const amount = round2(num(input.amount));
  if (amount <= 0) throw new Error("Purchase accounting amount must be greater than zero");

  const existing = await tx.accountTransaction.findFirst({
    where: { businessId: input.businessId, sourceType: "grocery_purchase_invoice", sourceId: input.purchaseId },
  });
  if (existing) return { duplicate: true, amount };

  const business = await tx.business.findUnique({ where: { id: input.businessId }, select: { currency: true } });
  const currency = String(business?.currency || "QAR").trim().toUpperCase() || "QAR";
  const inventory = await resolveAccount(tx, input.businessId, currency, {
    settingKeys: ["accounting.inventoryAccountId", "accounting.inventory", "accounting.defaultInventoryAccountId"],
    systemCode: "inventory",
    name: "Inventory",
    type: "asset",
    nameMatches: ["inventory", "inventory asset", "stock", "stock inventory"],
  });
  const payable = await resolveAccount(tx, input.businessId, currency, {
    settingKeys: ["accounting.accountsPayableAccountId", "accounting.apAccountId", "accounting.accountsPayable"],
    systemCode: "accounts_payable",
    name: "Accounts Payable",
    type: "liability",
    nameMatches: ["accounts payable", "account payable", "trade payables", "supplier payable", "supplier payables"],
  });

  const referenceNo = input.purchaseNo;
  const description = `Grocery purchase invoice ${input.purchaseNo}`;
  await tx.accountTransaction.createMany({
    data: [
      { businessId: input.businessId, accountId: inventory.id, type: "debit", amount, referenceNo, description, transactionDate: input.purchaseDate, sourceType: "grocery_purchase_invoice", sourceId: input.purchaseId, createdByUserId: input.userId },
      { businessId: input.businessId, accountId: payable.id, type: "credit", amount, referenceNo, description, transactionDate: input.purchaseDate, sourceType: "grocery_purchase_invoice", sourceId: input.purchaseId, createdByUserId: input.userId },
    ],
  });
  await tx.account.update({ where: { id: inventory.id }, data: { currentBalance: { increment: amount } } });
  await tx.account.update({ where: { id: payable.id }, data: { currentBalance: { decrement: amount } } });

  const debit = amount;
  const credit = amount;
  if (Math.abs(debit - credit) > 0.001) throw new Error("Purchase journal is not balanced");
  return { duplicate: false, amount, debit, credit, currency, inventoryAccountId: inventory.id, payableAccountId: payable.id };
}
