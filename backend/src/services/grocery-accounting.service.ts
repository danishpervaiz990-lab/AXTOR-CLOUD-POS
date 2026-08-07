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
function text(value: unknown) {
  return String(value ?? "").trim();
}

export type GroceryJournalLine = {
  accountId?: string | null;
  systemCode?: string | null;
  accountName?: string | null;
  accountType?: string | null;
  debit?: number;
  credit?: number;
  description?: string | null;
};

const STANDARD_ACCOUNTS = [
  { code: "1000", systemCode: "cash", name: "Cash", type: "asset" },
  { code: "1010", systemCode: "bank", name: "Bank", type: "asset" },
  { code: "1020", systemCode: "card_clearing", name: "Card Clearing", type: "asset" },
  { code: "1030", systemCode: "digital_wallet", name: "Digital Wallet Clearing", type: "asset" },
  { code: "1100", systemCode: "accounts_receivable", name: "Accounts Receivable", type: "asset" },
  { code: "1200", systemCode: "inventory", name: "Inventory", type: "asset" },
  { code: "1300", systemCode: "other_current_assets", name: "Other Current Assets", type: "asset" },
  { code: "1500", systemCode: "fixed_assets", name: "Fixed Assets", type: "asset" },
  { code: "2000", systemCode: "accounts_payable", name: "Accounts Payable", type: "liability" },
  { code: "2100", systemCode: "tax_payable", name: "Tax Payable", type: "liability" },
  { code: "2200", systemCode: "loans", name: "Loans", type: "liability" },
  { code: "2300", systemCode: "other_liabilities", name: "Other Liabilities", type: "liability" },
  { code: "3000", systemCode: "owner_equity", name: "Owner Equity", type: "equity" },
  { code: "3100", systemCode: "retained_earnings", name: "Retained Earnings", type: "equity" },
  { code: "4000", systemCode: "sales_revenue", name: "Sales Revenue", type: "income" },
  { code: "4100", systemCode: "other_income", name: "Other Income", type: "income" },
  { code: "5000", systemCode: "cogs", name: "Cost of Goods Sold", type: "cogs" },
  { code: "6000", systemCode: "expense_rent", name: "Rent Expense", type: "expense" },
  { code: "6010", systemCode: "expense_salaries", name: "Salary Expense", type: "expense" },
  { code: "6020", systemCode: "expense_electricity", name: "Electricity Expense", type: "expense" },
  { code: "6030", systemCode: "expense_fuel", name: "Fuel Expense", type: "expense" },
  { code: "6040", systemCode: "expense_delivery", name: "Delivery Expense", type: "expense" },
  { code: "6050", systemCode: "expense_maintenance", name: "Maintenance Expense", type: "expense" },
  { code: "6060", systemCode: "expense_bank_charges", name: "Bank Charges", type: "expense" },
  { code: "6090", systemCode: "expense_general", name: "General Expense", type: "expense" },
] as const;

async function businessCurrency(tx: any, businessId: string) {
  const business = await tx.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  return String(business?.currency || "QAR").trim().toUpperCase() || "QAR";
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

export async function resolveGroceryAccount(tx: any, businessId: string, currency: string, input: {
  settingKeys?: string[];
  systemCode: string;
  name: string;
  type: string;
  accountCode?: string;
  nameMatches?: string[];
}) {
  const configuredId = input.settingKeys?.length ? await settingAccountId(tx, businessId, input.settingKeys) : null;
  if (configuredId) {
    const configured = await tx.account.findFirst({ where: { id: configuredId, businessId, active: true } });
    if (!configured) throw new Error(`Configured ${input.name} account is missing or inactive`);
    return configured;
  }

  const accounts = await tx.account.findMany({ where: { businessId, active: true } });
  const bySystemCode = accounts.find((a: any) => String(json(a.metadata).systemCode || "").toLowerCase() === input.systemCode.toLowerCase());
  if (bySystemCode) return bySystemCode;
  const matches = (input.nameMatches || [input.name]).map((x) => x.trim().toLowerCase());
  const byName = accounts.find((a: any) => matches.includes(String(a.name || "").trim().toLowerCase()));
  if (byName) return byName;

  return tx.account.create({
    data: {
      businessId,
      name: input.name,
      type: input.type,
      accountNumber: input.accountCode || null,
      currency,
      openingBalance: 0,
      currentBalance: 0,
      active: true,
      metadata: { systemCode: input.systemCode, accountCode: input.accountCode || null, createdBy: "grocery_accounting", managedFallback: true },
    },
  });
}

export async function ensureStandardGroceryAccounts(tx: any, businessId: string) {
  const currency = await businessCurrency(tx, businessId);
  const rows = [];
  for (const definition of STANDARD_ACCOUNTS) {
    rows.push(await resolveGroceryAccount(tx, businessId, currency, {
      systemCode: definition.systemCode,
      name: definition.name,
      type: definition.type,
      accountCode: definition.code,
      nameMatches: [definition.name],
    }));
  }
  return rows;
}

async function accountByLine(tx: any, businessId: string, currency: string, line: GroceryJournalLine) {
  if (line.accountId) {
    const account = await tx.account.findFirst({ where: { id: line.accountId, businessId, active: true } });
    if (!account) throw new Error("Journal account is missing or inactive");
    return account;
  }
  const systemCode = text(line.systemCode);
  const accountName = text(line.accountName);
  if (!systemCode && !accountName) throw new Error("Each journal line requires accountId or account mapping");
  return resolveGroceryAccount(tx, businessId, currency, {
    systemCode: systemCode || accountName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    name: accountName || systemCode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    type: text(line.accountType) || "expense",
  });
}

export async function postBalancedGroceryJournal(tx: any, input: {
  businessId: string;
  userId?: string | null;
  referenceNo: string;
  description?: string | null;
  transactionDate?: Date;
  sourceType: string;
  sourceId: string;
  lines: GroceryJournalLine[];
}) {
  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  if (rawLines.length < 2) throw new Error("A journal requires at least two lines");
  const normalized = rawLines.map((line) => ({ ...line, debit: round2(Math.max(0, num(line.debit))), credit: round2(Math.max(0, num(line.credit))) }));
  for (const line of normalized) {
    if (line.debit > 0 && line.credit > 0) throw new Error("One journal line cannot contain both debit and credit");
    if (line.debit <= 0 && line.credit <= 0) throw new Error("Each journal line requires a debit or credit amount");
  }
  const debit = round2(normalized.reduce((sum, line) => sum + line.debit, 0));
  const credit = round2(normalized.reduce((sum, line) => sum + line.credit, 0));
  if (Math.abs(debit - credit) > 0.001) throw new Error(`Unbalanced journal rejected: debit ${debit.toFixed(2)} does not equal credit ${credit.toFixed(2)}`);

  const existing = await tx.accountTransaction.findFirst({ where: { businessId: input.businessId, sourceType: input.sourceType, sourceId: input.sourceId } });
  if (existing) return { duplicate: true, debit, credit, lineCount: normalized.length };

  const currency = await businessCurrency(tx, input.businessId);
  const resolved = [];
  for (const line of normalized) {
    const account = await accountByLine(tx, input.businessId, currency, line);
    resolved.push({ line, account });
  }

  const transactionDate = input.transactionDate || new Date();
  for (const { line, account } of resolved) {
    const type = line.debit > 0 ? "debit" : "credit";
    const amount = line.debit > 0 ? line.debit : line.credit;
    await tx.accountTransaction.create({
      data: {
        businessId: input.businessId,
        accountId: account.id,
        type,
        amount,
        referenceNo: input.referenceNo,
        description: text(line.description) || text(input.description) || null,
        transactionDate,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        createdByUserId: input.userId || null,
      },
    });
    await tx.account.update({
      where: { id: account.id },
      data: { currentBalance: type === "debit" ? { increment: amount } : { decrement: amount } },
    });
  }
  return { duplicate: false, debit, credit, lineCount: normalized.length, currency };
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
  const currency = await businessCurrency(tx, input.businessId);
  const inventory = await resolveGroceryAccount(tx, input.businessId, currency, {
    settingKeys: ["accounting.inventoryAccountId", "accounting.inventory", "accounting.defaultInventoryAccountId"],
    systemCode: "inventory", name: "Inventory", type: "asset", accountCode: "1200",
    nameMatches: ["inventory", "inventory asset", "stock", "stock inventory"],
  });
  const payable = await resolveGroceryAccount(tx, input.businessId, currency, {
    settingKeys: ["accounting.accountsPayableAccountId", "accounting.apAccountId", "accounting.accountsPayable"],
    systemCode: "accounts_payable", name: "Accounts Payable", type: "liability", accountCode: "2000",
    nameMatches: ["accounts payable", "account payable", "trade payables", "supplier payable", "supplier payables"],
  });
  return postBalancedGroceryJournal(tx, {
    businessId: input.businessId, userId: input.userId, referenceNo: input.purchaseNo,
    description: `Grocery purchase invoice ${input.purchaseNo}`, transactionDate: input.purchaseDate,
    sourceType: "grocery_purchase_invoice", sourceId: input.purchaseId,
    lines: [{ accountId: inventory.id, debit: amount }, { accountId: payable.id, credit: amount }],
  });
}

function paymentSystemCode(method: string) {
  const m = method.toLowerCase();
  if (m.includes("card")) return "card_clearing";
  if (m.includes("bank")) return "bank";
  if (m.includes("mobile") || m.includes("digital") || m.includes("wallet")) return "digital_wallet";
  if (m.includes("cheque") || m.includes("check")) return "bank";
  return "cash";
}

export async function postGrocerySaleAccounting(tx: any, input: {
  businessId: string;
  userId?: string | null;
  document: any;
  cogs: number;
}) {
  const document = input.document;
  const total = round2(num(document.baseTotal || document.total));
  const tax = round2(num(document.baseTax || document.tax));
  const paid = round2(num(document.basePaid || document.paid));
  const balance = round2(num(document.baseBalance || document.balance));
  const cogs = round2(Math.max(0, num(input.cogs)));
  if (total <= 0) throw new Error("Sale accounting requires a positive invoice total");
  const currency = await businessCurrency(tx, input.businessId);
  const sales = await resolveGroceryAccount(tx, input.businessId, currency, {
    settingKeys: ["accounting.salesIncomeAccountId", "accounting.salesIncome", "accounting.sales"],
    systemCode: "sales_revenue", name: "Sales Revenue", type: "income", accountCode: "4000",
  });
  const ar = await resolveGroceryAccount(tx, input.businessId, currency, {
    settingKeys: ["accounting.accountsReceivableAccountId", "accounting.arAccountId", "accounting.accountsReceivable"],
    systemCode: "accounts_receivable", name: "Accounts Receivable", type: "asset", accountCode: "1100",
  });
  const inventory = await resolveGroceryAccount(tx, input.businessId, currency, {
    settingKeys: ["accounting.inventoryAccountId", "accounting.inventory"],
    systemCode: "inventory", name: "Inventory", type: "asset", accountCode: "1200",
  });
  const cogsAccount = await resolveGroceryAccount(tx, input.businessId, currency, {
    settingKeys: ["accounting.cogsAccountId", "accounting.cogs"],
    systemCode: "cogs", name: "Cost of Goods Sold", type: "cogs", accountCode: "5000",
  });
  const taxPayable = tax > 0 ? await resolveGroceryAccount(tx, input.businessId, currency, {
    settingKeys: ["accounting.taxPayableAccountId", "accounting.taxPayable"],
    systemCode: "tax_payable", name: "Tax Payable", type: "liability", accountCode: "2100",
  }) : null;

  const metadata = json(document.metadata);
  const exchangeRate = Math.max(0.00000001, num(document.exchangeRate, 1));
  const paymentLines = Array.isArray(metadata.paymentLines) ? metadata.paymentLines : [];
  const debitLines: GroceryJournalLine[] = [];
  let allocatedPaid = 0;
  for (const line of paymentLines) {
    const amount = round2(num(line.amount) * exchangeRate);
    if (amount <= 0 || String(line.method || "").toLowerCase() === "credit") continue;
    allocatedPaid = round2(allocatedPaid + amount);
    const systemCode = paymentSystemCode(String(line.method || document.paymentMethod || "cash"));
    const definition = STANDARD_ACCOUNTS.find((x) => x.systemCode === systemCode)!;
    const account = line.accountId
      ? await tx.account.findFirst({ where: { id: String(line.accountId), businessId: input.businessId, active: true } })
      : await resolveGroceryAccount(tx, input.businessId, currency, { systemCode, name: definition.name, type: definition.type, accountCode: definition.code });
    if (!account) throw new Error("Configured payment account is invalid");
    debitLines.push({ accountId: account.id, debit: amount, description: `Payment ${String(line.method || "cash")}` });
  }
  if (!debitLines.length && paid > 0) {
    const systemCode = paymentSystemCode(String(document.paymentMethod || "cash"));
    const definition = STANDARD_ACCOUNTS.find((x) => x.systemCode === systemCode)!;
    const account = await resolveGroceryAccount(tx, input.businessId, currency, { systemCode, name: definition.name, type: definition.type, accountCode: definition.code });
    debitLines.push({ accountId: account.id, debit: paid });
    allocatedPaid = paid;
  }
  const arAmount = round2(Math.max(0, total - allocatedPaid));
  if (arAmount > 0) debitLines.push({ accountId: ar.id, debit: arAmount });
  const revenue = round2(total - tax);
  const lines: GroceryJournalLine[] = [...debitLines, { accountId: sales.id, credit: revenue }];
  if (taxPayable && tax > 0) lines.push({ accountId: taxPayable.id, credit: tax });
  if (cogs > 0) lines.push({ accountId: cogsAccount.id, debit: cogs }, { accountId: inventory.id, credit: cogs });

  return postBalancedGroceryJournal(tx, {
    businessId: input.businessId, userId: input.userId, referenceNo: String(document.documentNo),
    description: `Grocery sale ${document.documentNo}`, transactionDate: document.issuedAt || new Date(),
    sourceType: "grocery_sales_invoice", sourceId: String(document.id), lines,
  });
}

export async function postGroceryCustomerPaymentAccounting(tx: any, input: {
  businessId: string; userId?: string | null; payment: any;
}) {
  const payment = input.payment;
  const amount = round2(num(payment.baseAmount || payment.amount));
  if (amount <= 0) throw new Error("Customer payment amount must be greater than zero");
  const currency = await businessCurrency(tx, input.businessId);
  const ar = await resolveGroceryAccount(tx, input.businessId, currency, { systemCode: "accounts_receivable", name: "Accounts Receivable", type: "asset", accountCode: "1100" });
  const systemCode = paymentSystemCode(String(payment.method || "cash"));
  const definition = STANDARD_ACCOUNTS.find((x) => x.systemCode === systemCode)!;
  const cash = payment.accountId
    ? await tx.account.findFirst({ where: { id: payment.accountId, businessId: input.businessId, active: true } })
    : await resolveGroceryAccount(tx, input.businessId, currency, { systemCode, name: definition.name, type: definition.type, accountCode: definition.code });
  if (!cash) throw new Error("Customer payment deposit account is invalid");
  return postBalancedGroceryJournal(tx, {
    businessId: input.businessId, userId: input.userId, referenceNo: String(payment.receiptNo),
    description: `Customer receipt ${payment.receiptNo}`, transactionDate: payment.paymentDate || new Date(),
    sourceType: "grocery_customer_payment", sourceId: String(payment.id),
    lines: [{ accountId: cash.id, debit: amount }, { accountId: ar.id, credit: amount }],
  });
}

export async function postGrocerySupplierPaymentAccounting(tx: any, input: {
  businessId: string; userId?: string | null; payment: any;
}) {
  const payment = input.payment;
  const amount = round2(num(payment.baseAmount || payment.amount));
  if (amount <= 0) throw new Error("Supplier payment amount must be greater than zero");
  const currency = await businessCurrency(tx, input.businessId);
  const ap = await resolveGroceryAccount(tx, input.businessId, currency, { systemCode: "accounts_payable", name: "Accounts Payable", type: "liability", accountCode: "2000" });
  const systemCode = paymentSystemCode(String(payment.method || "cash"));
  const definition = STANDARD_ACCOUNTS.find((x) => x.systemCode === systemCode)!;
  const cash = payment.accountId
    ? await tx.account.findFirst({ where: { id: payment.accountId, businessId: input.businessId, active: true } })
    : await resolveGroceryAccount(tx, input.businessId, currency, { systemCode, name: definition.name, type: definition.type, accountCode: definition.code });
  if (!cash) throw new Error("Supplier payment account is invalid");
  return postBalancedGroceryJournal(tx, {
    businessId: input.businessId, userId: input.userId, referenceNo: String(payment.voucherNo),
    description: `Supplier payment ${payment.voucherNo}`, transactionDate: payment.paymentDate || new Date(),
    sourceType: "grocery_supplier_payment", sourceId: String(payment.id),
    lines: [{ accountId: ap.id, debit: amount }, { accountId: cash.id, credit: amount }],
  });
}

export async function postGroceryExpenseAccounting(tx: any, input: {
  businessId: string; userId?: string | null; expense: any; paymentMethod?: string | null;
}) {
  const expense = input.expense;
  const amount = round2(num(expense.baseAmount || expense.amount));
  if (amount <= 0) throw new Error("Expense amount must be greater than zero");
  const currency = await businessCurrency(tx, input.businessId);
  const metadata = json(expense.metadata);
  const category = text(expense.category || metadata.expenseCategory || "General Expense");
  const expenseSystemCode = `expense_${category.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const expenseAccount = expense.accountId
    ? await tx.account.findFirst({ where: { id: expense.accountId, businessId: input.businessId, active: true } })
    : await resolveGroceryAccount(tx, input.businessId, currency, { systemCode: expenseSystemCode, name: category, type: "expense" });
  if (!expenseAccount) throw new Error("Expense account is invalid");
  const method = text(input.paymentMethod || metadata.paymentMethod || "cash");
  const systemCode = paymentSystemCode(method);
  const definition = STANDARD_ACCOUNTS.find((x) => x.systemCode === systemCode)!;
  const payAccountId = text(metadata.paymentAccountId);
  const payAccount = payAccountId
    ? await tx.account.findFirst({ where: { id: payAccountId, businessId: input.businessId, active: true } })
    : await resolveGroceryAccount(tx, input.businessId, currency, { systemCode, name: definition.name, type: definition.type, accountCode: definition.code });
  if (!payAccount) throw new Error("Expense payment account is invalid");
  return postBalancedGroceryJournal(tx, {
    businessId: input.businessId, userId: input.userId, referenceNo: String(expense.referenceNo || expense.id),
    description: `Expense ${category}`, transactionDate: expense.expenseDate || new Date(),
    sourceType: "grocery_expense", sourceId: String(expense.id),
    lines: [{ accountId: expenseAccount.id, debit: amount }, { accountId: payAccount.id, credit: amount }],
  });
}
