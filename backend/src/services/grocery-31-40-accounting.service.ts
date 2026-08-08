import { prisma } from "../db/prisma.js";
import { ApiError, cleanString, roundMoney } from "../utils/http.js";

const db: any = prisma;
const DAY = 86_400_000;
const IDS = new Set([
  "grocery-trial-balance",
  "grocery-balance-sheet",
  "grocery-general-ledger",
  "grocery-account-ledger",
  "grocery-journal-report",
  "grocery-cash-book",
  "grocery-bank-book",
  "grocery-accounts-receivable-accounting",
  "grocery-accounts-payable-accounting",
  "grocery-customer-ageing-accounting",
  "grocery-supplier-ageing-accounting",
  "grocery-expense-accounting-report",
  "grocery-tax-summary-accounting",
  "grocery-tax-detail-accounting",
  "grocery-payment-accounting-report",
  "grocery-receipt-accounting-report",
  "grocery-cheque-accounting-report",
  "grocery-credit-debit-accounting-report",
  "grocery-cash-flow-accounting",
]);

const money = (value: unknown) => roundMoney(Number(value || 0));
const text = (value: unknown) => String(value ?? "").trim();
const json = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const pct = (value: unknown, base: unknown) => {
  const denominator = Number(base || 0);
  return Math.abs(denominator) < 0.0000001 ? 0 : roundMoney(Number(value || 0) / denominator * 100);
};

function qatarDate(value: string, end = false) {
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}+03:00`);
}

function range(query: any) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  const now = new Date();
  const toText = text(query?.to);
  const fromText = text(query?.from);
  const to = valid(toText) ? qatarDate(toText, true) : now;
  const from = valid(fromText) ? qatarDate(fromText) : new Date(to.getTime() - 30 * DAY);
  if (from > to) throw new ApiError(400, "Report start date cannot be after end date");
  return { from, to };
}

function columnsFrom(rows: any[], fallback: string[]) {
  const keys = rows.length ? Object.keys(rows[0]) : fallback;
  return keys.map((key) => ({ key, label: key.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase()) }));
}

function result(title: string, rows: any[], summary: any[] = [], fallback: string[] = [], meta: any = {}) {
  return { title, columns: columnsFrom(rows, fallback), rows, summary, meta };
}

async function requireGrocery(businessId: string) {
  const selection = await db.businessIndustry.findUnique({ where: { businessId }, include: { industry: { select: { code: true } } } });
  if (String(selection?.industry?.code || "").toLowerCase() !== "grocery") throw new ApiError(403, "Grocery accounting report requires a Grocery tenant");
}

function accountSide(type: unknown) {
  const t = text(type).toLowerCase();
  return ["liability", "equity", "income", "revenue"].includes(t) ? "credit" : "debit";
}

function openingPair(account: any) {
  const opening = Number(account.openingBalance || 0);
  if (!opening) return { debit: 0, credit: 0 };
  const normal = accountSide(account.type);
  if (opening > 0) return normal === "debit" ? { debit: opening, credit: 0 } : { debit: 0, credit: opening };
  return normal === "debit" ? { debit: 0, credit: Math.abs(opening) } : { debit: Math.abs(opening), credit: 0 };
}

function addTx(pair: { debit: number; credit: number }, tx: any) {
  const amount = Number(tx.amount || 0);
  if (String(tx.type).toLowerCase() === "debit") pair.debit += amount;
  else pair.credit += amount;
}

async function accountsAndTransactions(businessId: string, to: Date) {
  const [accounts, transactions] = await Promise.all([
    db.account.findMany({ where: { businessId, active: true }, orderBy: [{ accountNumber: "asc" }, { name: "asc" }] }),
    db.accountTransaction.findMany({ where: { businessId, transactionDate: { lte: to } }, orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }] }),
  ]);
  return { accounts, transactions };
}

async function trialBalance(businessId: string, query: any) {
  const { from, to } = range(query);
  const { accounts, transactions } = await accountsAndTransactions(businessId, to);
  const rows = accounts.map((account: any) => {
    const opening = openingPair(account);
    const period = { debit: 0, credit: 0 };
    for (const tx of transactions) {
      if (String(tx.accountId) !== String(account.id)) continue;
      if (new Date(tx.transactionDate) < from) addTx(opening, tx);
      else addTx(period, tx);
    }
    const net = opening.debit - opening.credit + period.debit - period.credit;
    return {
      accountCode: account.accountNumber || "-",
      accountName: account.name,
      openingDebit: money(opening.debit),
      openingCredit: money(opening.credit),
      periodDebit: money(period.debit),
      periodCredit: money(period.credit),
      closingDebit: money(net > 0 ? net : 0),
      closingCredit: money(net < 0 ? Math.abs(net) : 0),
      debitPct: 0,
      creditPct: 0,
    };
  });
  const totalDebit = money(rows.reduce((s: number, r: any) => s + r.closingDebit, 0));
  const totalCredit = money(rows.reduce((s: number, r: any) => s + r.closingCredit, 0));
  const difference = money(totalDebit - totalCredit);
  if (Math.abs(difference) > 0.01) throw new ApiError(409, `Accounting integrity error: Trial Balance debit ${totalDebit.toFixed(2)} does not equal credit ${totalCredit.toFixed(2)} (difference ${difference.toFixed(2)})`);
  for (const row of rows) {
    row.debitPct = pct(row.closingDebit, totalDebit);
    row.creditPct = pct(row.closingCredit, totalCredit);
  }
  return result("Grocery Trial Balance", rows, [
    { label: "Total Debit", value: totalDebit },
    { label: "Total Credit", value: totalCredit },
    { label: "Difference", value: difference },
  ], ["accountCode", "accountName", "openingDebit", "openingCredit", "periodDebit", "periodCredit", "closingDebit", "closingCredit", "debitPct", "creditPct"], { from, to, integrity: "balanced" });
}

async function balancesAt(businessId: string, asOf: Date) {
  const { accounts, transactions } = await accountsAndTransactions(businessId, asOf);
  const txByAccount = new Map<string, any[]>();
  for (const tx of transactions) {
    const key = String(tx.accountId);
    const list = txByAccount.get(key) || [];
    list.push(tx);
    txByAccount.set(key, list);
  }
  return accounts.map((account: any) => {
    const pair = openingPair(account);
    for (const tx of txByAccount.get(String(account.id)) || []) addTx(pair, tx);
    const debitNet = pair.debit - pair.credit;
    const type = text(account.type).toLowerCase();
    const amount = ["liability", "equity", "income", "revenue"].includes(type) ? -debitNet : debitNet;
    return { accountId: account.id, code: account.accountNumber || "-", name: account.name, type, amount: money(amount), metadata: json(account.metadata) };
  });
}

function balanceSheetSnapshot(rows: any[]) {
  const assets = rows.filter((r) => r.type === "asset").map((r) => ({ ...r }));
  const liabilities = rows.filter((r) => r.type === "liability").map((r) => ({ ...r }));
  const equity = rows.filter((r) => r.type === "equity").map((r) => ({ ...r }));
  const income = rows.filter((r) => ["income", "revenue"].includes(r.type)).reduce((s, r) => s + r.amount, 0);
  const cogs = rows.filter((r) => r.type === "cogs").reduce((s, r) => s + r.amount, 0);
  const expenses = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const currentEarnings = money(income - cogs - expenses);
  equity.push({ accountId: "current-earnings", code: "CURRENT", name: "Current Earnings", type: "equity", amount: currentEarnings, metadata: { derivedFromLedger: true } });
  return {
    assets,
    liabilities,
    equity,
    totalAssets: money(assets.reduce((s, r) => s + r.amount, 0)),
    totalLiabilities: money(liabilities.reduce((s, r) => s + r.amount, 0)),
    totalEquity: money(equity.reduce((s, r) => s + r.amount, 0)),
    currentEarnings,
  };
}

async function balanceSheet(businessId: string, query: any) {
  const { from, to } = range(query);
  const previousTo = new Date(from.getTime() - 1);
  const [currentRows, previousRows] = await Promise.all([balancesAt(businessId, to), balancesAt(businessId, previousTo)]);
  const current = balanceSheetSnapshot(currentRows);
  const previous = balanceSheetSnapshot(previousRows);
  const equationDifference = money(current.totalAssets - current.totalLiabilities - current.totalEquity);
  if (Math.abs(equationDifference) > 0.01) throw new ApiError(409, `Accounting integrity error: Assets ${current.totalAssets.toFixed(2)} do not equal Liabilities + Equity ${money(current.totalLiabilities + current.totalEquity).toFixed(2)} (difference ${equationDifference.toFixed(2)})`);
  const sectionRows = [
    ...current.assets.map((r: any) => ({ section: "Assets", accountCode: r.code, accountName: r.name, currentPeriod: r.amount })),
    ...current.liabilities.map((r: any) => ({ section: "Liabilities", accountCode: r.code, accountName: r.name, currentPeriod: r.amount })),
    ...current.equity.map((r: any) => ({ section: "Equity", accountCode: r.code, accountName: r.name, currentPeriod: r.amount })),
  ];
  const previousMap = new Map(previousRows.map((r: any) => [String(r.accountId), r.amount]));
  previousMap.set("current-earnings", previous.currentEarnings);
  const rows = sectionRows.map((row: any) => {
    const currentAccount = [...current.assets, ...current.liabilities, ...current.equity].find((r: any) => r.code === row.accountCode && r.name === row.accountName);
    const previousAmount = money(previousMap.get(String(currentAccount?.accountId)) || 0);
    const difference = money(row.currentPeriod - previousAmount);
    return { ...row, previousPeriod: previousAmount, difference, changePct: pct(difference, Math.abs(previousAmount)) };
  });
  return result("Grocery Balance Sheet", rows, [
    { label: "Assets", value: current.totalAssets },
    { label: "Liabilities", value: current.totalLiabilities },
    { label: "Equity", value: current.totalEquity },
    { label: "Equation Difference", value: equationDifference },
  ], ["section", "accountCode", "accountName", "currentPeriod", "previousPeriod", "difference", "changePct"], { asOf: to, previousAsOf: previousTo, integrity: "assets=liabilities+equity" });
}

async function ledgerRows(businessId: string, query: any, mode: "all" | "cash" | "bank" | "account") {
  const { from, to } = range(query);
  const accounts = await db.account.findMany({ where: { businessId, active: true } });
  let selected = accounts;
  if (mode === "account") {
    const id = cleanString(query.accountId);
    if (!id) throw new ApiError(400, "accountId is required for Account Ledger");
    selected = accounts.filter((a: any) => String(a.id) === String(id));
  } else if (mode === "cash" || mode === "bank") {
    selected = accounts.filter((a: any) => {
      const systemCode = text(json(a.metadata).systemCode).toLowerCase();
      const name = text(a.name).toLowerCase();
      return mode === "cash" ? systemCode === "cash" || name.includes("cash") : systemCode === "bank" || name.includes("bank");
    });
  }
  const ids = selected.map((a: any) => a.id);
  const transactions = ids.length ? await db.accountTransaction.findMany({ where: { businessId, accountId: { in: ids }, transactionDate: { gte: from, lte: to } }, orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }] }) : [];
  const accountMap = new Map(selected.map((a: any) => [String(a.id), a]));
  const running = new Map<string, number>();
  return transactions.map((tx: any) => {
    const account: any = accountMap.get(String(tx.accountId));
    const delta = String(tx.type).toLowerCase() === "debit" ? Number(tx.amount || 0) : -Number(tx.amount || 0);
    const next = money((running.get(String(tx.accountId)) || 0) + delta);
    running.set(String(tx.accountId), next);
    return { date: tx.transactionDate, accountCode: account?.accountNumber || "-", account: account?.name || "Unknown", reference: tx.referenceNo || "-", description: tx.description || "-", debit: String(tx.type).toLowerCase() === "debit" ? money(tx.amount) : 0, credit: String(tx.type).toLowerCase() === "credit" ? money(tx.amount) : 0, runningBalance: next, sourceType: tx.sourceType || "-", sourceId: tx.sourceId || "-" };
  });
}

async function journalReport(businessId: string, query: any) {
  const rows = await ledgerRows(businessId, query, "all");
  const grouped = new Map<string, any>();
  for (const row of rows) {
    const key = `${row.sourceType}:${row.sourceId}:${row.reference}`;
    const g = grouped.get(key) || { date: row.date, reference: row.reference, sourceType: row.sourceType, sourceId: row.sourceId, debit: 0, credit: 0, lines: 0 };
    g.debit += row.debit; g.credit += row.credit; g.lines += 1; grouped.set(key, g);
  }
  return [...grouped.values()].map((g: any) => ({ ...g, debit: money(g.debit), credit: money(g.credit), difference: money(g.debit - g.credit), balanced: Math.abs(g.debit - g.credit) <= 0.01 }));
}

function ageingBucket(days: number) {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

async function customerAgeing(businessId: string) {
  const now = new Date();
  const docs = await db.salesDocument.findMany({ where: { businessId, documentType: "INVOICE", balance: { gt: 0 }, status: { notIn: ["DRAFT", "CANCELLED", "VOID"] } }, orderBy: { dueDate: "asc" } });
  return docs.map((d: any) => { const due = d.dueDate ? new Date(d.dueDate) : new Date(d.createdAt); const days = Math.floor((now.getTime() - due.getTime()) / DAY); return { customer: d.customerName, invoice: d.documentNo, dueDate: due, outstanding: money(d.balance), daysPastDue: Math.max(0, days), bucket: ageingBucket(days) }; });
}

async function supplierAgeing(businessId: string) {
  const now = new Date();
  const rows = await db.purchase.findMany({ where: { businessId, balance: { gt: 0 }, status: { not: "CANCELLED" } }, orderBy: { dueDate: "asc" } });
  return rows.map((p: any) => { const due = p.dueDate ? new Date(p.dueDate) : new Date(p.purchaseDate); const days = Math.floor((now.getTime() - due.getTime()) / DAY); return { supplier: p.supplierName, purchase: p.purchaseNo, dueDate: due, outstanding: money(p.balance), daysPastDue: Math.max(0, days), bucket: ageingBucket(days) }; });
}

async function additionalReport(businessId: string, id: string, query: any) {
  const { from, to } = range(query);
  if (id === "grocery-general-ledger" || id === "grocery-account-ledger" || id === "grocery-cash-book" || id === "grocery-bank-book") {
    const mode = id === "grocery-account-ledger" ? "account" : id === "grocery-cash-book" ? "cash" : id === "grocery-bank-book" ? "bank" : "all";
    const rows = await ledgerRows(businessId, query, mode as any);
    return result(id === "grocery-general-ledger" ? "General Ledger" : id === "grocery-account-ledger" ? "Account Ledger" : id === "grocery-cash-book" ? "Cash Book" : "Bank Book", rows, [{ label: "Debit", value: money(rows.reduce((s: number, r: any) => s + r.debit, 0)) }, { label: "Credit", value: money(rows.reduce((s: number, r: any) => s + r.credit, 0)) }]);
  }
  if (id === "grocery-journal-report") {
    const rows = await journalReport(businessId, query);
    const unbalanced = rows.filter((r: any) => !r.balanced);
    if (unbalanced.length) throw new ApiError(409, `Accounting integrity error: ${unbalanced.length} journal groups are unbalanced`);
    return result("Journal Report", rows, [{ label: "Journals", value: rows.length }, { label: "Unbalanced", value: unbalanced.length }]);
  }
  if (id === "grocery-accounts-receivable-accounting") {
    const rows = await db.customer.findMany({ where: { businessId, active: true, balance: { gt: 0 } }, orderBy: { balance: "desc" } });
    const total = money(rows.reduce((s: number, r: any) => s + Number(r.balance || 0), 0));
    return result("Accounts Receivable", rows.map((r: any) => ({ customer: r.name, balance: money(r.balance), creditLimit: money(r.creditLimit), receivablePct: pct(r.balance, total) })), [{ label: "Receivables", value: total }]);
  }
  if (id === "grocery-accounts-payable-accounting") {
    const rows = await db.supplier.findMany({ where: { businessId, active: true, balance: { gt: 0 } }, orderBy: { balance: "desc" } });
    const total = money(rows.reduce((s: number, r: any) => s + Number(r.balance || 0), 0));
    return result("Accounts Payable", rows.map((r: any) => ({ supplier: r.name, balance: money(r.balance), payablePct: pct(r.balance, total) })), [{ label: "Payables", value: total }]);
  }
  if (id === "grocery-customer-ageing-accounting") return result("Customer Ageing", await customerAgeing(businessId));
  if (id === "grocery-supplier-ageing-accounting") return result("Supplier Ageing", await supplierAgeing(businessId));
  if (id === "grocery-expense-accounting-report") {
    const rows = await db.expense.findMany({ where: { businessId, expenseDate: { gte: from, lte: to } }, orderBy: { expenseDate: "desc" } });
    const total = money(rows.reduce((s: number, r: any) => s + Number(r.baseAmount || r.amount || 0), 0));
    return result("Expense Report", rows.map((r: any) => ({ date: r.expenseDate, voucher: r.expenseNo || r.id, category: r.category, payee: r.payee || "-", amount: money(r.baseAmount || r.amount), expensePct: pct(r.baseAmount || r.amount, total) })), [{ label: "Expenses", value: total }]);
  }
  if (id === "grocery-tax-summary-accounting" || id === "grocery-tax-detail-accounting") {
    const [sales, purchases] = await Promise.all([
      db.salesDocument.findMany({ where: { businessId, documentType: "INVOICE", createdAt: { gte: from, lte: to }, status: { notIn: ["DRAFT", "CANCELLED", "VOID"] } } }),
      db.purchase.findMany({ where: { businessId, purchaseDate: { gte: from, lte: to }, status: { not: "CANCELLED" } } }),
    ]);
    if (id === "grocery-tax-detail-accounting") {
      const rows = [...sales.map((r: any) => ({ date: r.createdAt, type: "Sales Tax", reference: r.documentNo, taxableAmount: money(Number(r.total || 0) - Number(r.tax || 0)), tax: money(r.tax) })), ...purchases.map((r: any) => ({ date: r.purchaseDate, type: "Purchase Tax", reference: r.purchaseNo, taxableAmount: money(Number(r.total || 0) - Number(r.tax || 0)), tax: money(r.tax) }))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return result("Tax Detail", rows, [{ label: "Output Tax", value: money(sales.reduce((s: number, r: any) => s + Number(r.tax || 0), 0)) }, { label: "Input Tax", value: money(purchases.reduce((s: number, r: any) => s + Number(r.tax || 0), 0)) }]);
    }
    const output = money(sales.reduce((s: number, r: any) => s + Number(r.tax || 0), 0));
    const input = money(purchases.reduce((s: number, r: any) => s + Number(r.tax || 0), 0));
    return result("Tax Summary", [{ taxType: "Output Tax", amount: output }, { taxType: "Input Tax", amount: input }, { taxType: "Net Tax Payable", amount: money(output - input) }], [{ label: "Net Tax", value: money(output - input) }]);
  }
  if (id === "grocery-payment-accounting-report" || id === "grocery-receipt-accounting-report") {
    const rows = await db.customerPayment.findMany({ where: { businessId, paymentDate: { gte: from, lte: to } }, orderBy: { paymentDate: "desc" } });
    const total = money(rows.reduce((s: number, r: any) => s + Number(r.baseAmount || r.amount || 0), 0));
    return result(id === "grocery-payment-accounting-report" ? "Payment Report" : "Receipt Report", rows.map((r: any) => ({ date: r.paymentDate, receipt: r.receiptNo, customer: r.customerName, method: r.method || "-", reference: r.referenceNo || "-", amount: money(r.baseAmount || r.amount), totalPct: pct(r.baseAmount || r.amount, total) })), [{ label: "Total", value: total }]);
  }
  if (id === "grocery-cheque-accounting-report") {
    const rows = await db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_cheque", createdAt: { gte: from, lte: to }, archivedAt: null }, orderBy: { dueAt: "asc" } });
    const total = money(rows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0));
    return result("Cheque Report", rows.map((r: any) => ({ chequeNumber: r.referenceNo, direction: json(r.data).direction || "inward", bank: json(r.data).bankName || "-", dueDate: r.dueAt, status: r.status, amount: money(r.amount), chequeValuePct: pct(r.amount, total) })), [{ label: "Cheque Value", value: total }]);
  }
  if (id === "grocery-credit-debit-accounting-report") {
    const rows = await ledgerRows(businessId, query, "all");
    const debit = money(rows.reduce((s: number, r: any) => s + r.debit, 0));
    const credit = money(rows.reduce((s: number, r: any) => s + r.credit, 0));
    return result("Credit / Debit Report", rows.map((r: any) => ({ ...r, debitPct: pct(r.debit, debit), creditPct: pct(r.credit, credit) })), [{ label: "Debit", value: debit }, { label: "Credit", value: credit }, { label: "Difference", value: money(debit - credit) }]);
  }
  if (id === "grocery-cash-flow-accounting") {
    const rows = [...await ledgerRows(businessId, query, "cash"), ...await ledgerRows(businessId, query, "bank")].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const inflow = money(rows.reduce((s: number, r: any) => s + r.debit, 0));
    const outflow = money(rows.reduce((s: number, r: any) => s + r.credit, 0));
    return result("Cash Flow — Ledger Cash Movement", rows.map((r: any) => ({ ...r, movement: money(r.debit - r.credit) })), [{ label: "Cash Inflows", value: inflow }, { label: "Cash Outflows", value: outflow }, { label: "Net Cash Change", value: money(inflow - outflow) }], [], { basis: "cash-and-bank-ledger-movement", note: "Presented because accounting data permits direct cash/bank ledger movement; this is not an indirect-method statutory cash-flow statement." });
  }
  throw new ApiError(404, "Grocery accounting report not found");
}

export function isGrocery31To33Report(id: string) { return IDS.has(id); }
export function grocery31To33ReportIds() { return [...IDS]; }

export async function runGrocery31To33Report(businessId: string, id: string, query: any = {}) {
  if (!IDS.has(id)) return null;
  await requireGrocery(businessId);
  if (id === "grocery-trial-balance") return trialBalance(businessId, query);
  if (id === "grocery-balance-sheet") return balanceSheet(businessId, query);
  return additionalReport(businessId, id, query);
}
