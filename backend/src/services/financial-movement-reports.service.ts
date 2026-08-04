import { prisma } from "../db/prisma.js";
import { ApiError, cleanString, plain, roundMoney } from "../utils/http.js";

const QATAR_OFFSET = "+03:00";
const REPORT_IDS = new Set(["transaction-ledger", "general-ledger", "payment-receipt-methods"]);

type DateRange = { from: Date; to: Date };
type MovementRow = {
  id: string;
  date: Date;
  source: string;
  reference: string;
  party: string;
  description: string;
  method: string;
  account: string;
  debit: number;
  credit: number;
  runningBalance?: number;
};

function qatarDate(value: string, endOfDay = false): Date {
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}${QATAR_OFFSET}`);
}

function range(query: any): DateRange {
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const fromText = cleanString(query?.from);
  const toText = cleanString(query?.to);
  return {
    from: fromText && /^\d{4}-\d{2}-\d{2}$/.test(fromText) ? qatarDate(fromText) : new Date(Date.now() - 30 * 86400000),
    to: toText && /^\d{4}-\d{2}-\d{2}$/.test(toText) ? qatarDate(toText, true) : qatarDate(today, true),
  };
}

function money(value: unknown): number {
  return roundMoney(Number(value || 0));
}

function sum(rows: any[], key: string): number {
  return money(rows.reduce((total, row) => total + Number(row[key] || 0), 0));
}

function percent(value: unknown, total: unknown): number {
  const denominator = Number(total || 0);
  return denominator ? money((Number(value || 0) / denominator) * 100) : 0;
}

function normalizeMethod(value: unknown): string {
  const method = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (!method) return "unspecified";
  if (/cash|cash on delivery|cod/.test(method)) return "cash";
  if (/cheque|check/.test(method)) return "cheque";
  if (/debit/.test(method)) return "debit card";
  if (/credit/.test(method)) return "credit card";
  if (/pos|card|visa|master|amex/.test(method)) return "pos / card";
  if (/online|bank|transfer|wire|gateway|payment link/.test(method)) return "online / bank transfer";
  if (/mixed|split/.test(method)) return "mixed";
  return method.slice(0, 80);
}

function isDebitType(value: unknown): boolean {
  const type = String(value || "").trim().toLowerCase();
  return ["debit", "deposit", "receipt", "income", "opening", "adjustment_in", "customer_payment", "sale_receipt"].includes(type)
    || /receipt|deposit|income|money in|customer payment/.test(type);
}

function sourceKey(sourceType: unknown, sourceId: unknown): string {
  return `${String(sourceType || "").trim().toLowerCase()}:${String(sourceId || "").trim()}`;
}

function report(title: string, columns: any[], rows: any[], summary: any[]) {
  return plain({ title, columns, rows, summary });
}

async function transactionLedger(businessId: string, query: any) {
  const { from, to } = range(query);
  const [transactions, customerPayments, supplierPayments, refunds, expenses, accounts] = await Promise.all([
    prisma.accountTransaction.findMany({
      where: { businessId, transactionDate: { gte: from, lte: to } },
      include: { account: { select: { name: true } } },
      orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.customerPayment.findMany({ where: { businessId, paymentDate: { gte: from, lte: to } }, orderBy: { paymentDate: "asc" } }),
    prisma.supplierPayment.findMany({ where: { businessId, paymentDate: { gte: from, lte: to } }, orderBy: { paymentDate: "asc" } }),
    prisma.customerRefund.findMany({ where: { businessId, refundDate: { gte: from, lte: to } }, orderBy: { refundDate: "asc" } }),
    prisma.expense.findMany({ where: { businessId, expenseDate: { gte: from, lte: to } }, orderBy: { expenseDate: "asc" } }),
    prisma.account.findMany({ where: { businessId }, select: { id: true, name: true } }),
  ]);

  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const represented = new Set(transactions.map((row) => sourceKey(row.sourceType, row.sourceId)));
  const rows: MovementRow[] = transactions.map((row) => {
    const debit = isDebitType(row.type) ? money(row.amount) : 0;
    const credit = debit ? 0 : money(row.amount);
    return {
      id: `account:${row.id}`,
      date: row.transactionDate,
      source: row.sourceType || "account transaction",
      reference: row.referenceNo || "-",
      party: "-",
      description: row.description || row.account?.name || "Account transaction",
      method: normalizeMethod((row as any).method || row.type),
      account: row.account?.name || "Account",
      debit,
      credit,
    };
  });

  const appendOrphan = (key: string, row: MovementRow) => {
    if (!represented.has(key)) rows.push(row);
  };

  for (const payment of customerPayments) {
    appendOrphan(sourceKey("customer_payment", payment.id), {
      id: `customer-payment:${payment.id}`,
      date: payment.paymentDate,
      source: "customer receipt",
      reference: payment.receiptNo || payment.referenceNo || "-",
      party: payment.customerName,
      description: "Customer payment received",
      method: normalizeMethod(payment.method),
      account: accountNames.get(payment.accountId || "") || "Unassigned account",
      debit: money(payment.amount),
      credit: 0,
    });
  }
  for (const payment of supplierPayments) {
    appendOrphan(sourceKey("supplier_payment", payment.id), {
      id: `supplier-payment:${payment.id}`,
      date: payment.paymentDate,
      source: "supplier payment",
      reference: payment.voucherNo || payment.referenceNo || "-",
      party: payment.supplierName,
      description: "Supplier payment issued",
      method: normalizeMethod(payment.method),
      account: accountNames.get(payment.accountId || "") || "Unassigned account",
      debit: 0,
      credit: money(payment.amount),
    });
  }
  for (const refund of refunds) {
    appendOrphan(sourceKey("customer_refund", refund.id), {
      id: `refund:${refund.id}`,
      date: refund.refundDate,
      source: "customer refund",
      reference: refund.refundNo || refund.referenceNo || "-",
      party: refund.customerName,
      description: refund.notes || "Customer refund issued",
      method: normalizeMethod(refund.method),
      account: accountNames.get(refund.accountId || "") || "Unassigned account",
      debit: 0,
      credit: money(refund.amount),
    });
  }
  for (const expense of expenses) {
    appendOrphan(sourceKey("expense", expense.id), {
      id: `expense:${expense.id}`,
      date: expense.expenseDate,
      source: "expense",
      reference: expense.referenceNo || "-",
      party: expense.category,
      description: expense.description || expense.category,
      method: normalizeMethod((expense.metadata as any)?.paymentMethod || "unspecified"),
      account: accountNames.get(expense.accountId || "") || "Unassigned account",
      debit: 0,
      credit: money(expense.amount),
    });
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  let balance = 0;
  for (const row of rows) {
    balance = money(balance + row.debit - row.credit);
    row.runningBalance = balance;
  }

  const methodFilter = normalizeMethod(query?.paymentMethod || "");
  const filtered = query?.paymentMethod
    ? rows.filter((row) => normalizeMethod(row.method) === methodFilter)
    : rows;
  const output = filtered.slice().reverse().map((row) => ({
    date: row.date,
    source: row.source,
    reference: row.reference,
    party: row.party,
    description: row.description,
    method: row.method,
    account: row.account,
    debit: row.debit,
    credit: row.credit,
    runningBalance: row.runningBalance,
  }));

  return report(
    "Debit / Credit Transaction Ledger",
    [
      { key: "date", label: "Date" }, { key: "source", label: "Transaction" },
      { key: "reference", label: "Reference" }, { key: "party", label: "Party" },
      { key: "description", label: "Description" }, { key: "method", label: "Payment Method" },
      { key: "account", label: "Account" }, { key: "debit", label: "Debit / Received" },
      { key: "credit", label: "Credit / Paid" }, { key: "runningBalance", label: "Running Balance" },
    ],
    output,
    [
      { label: "Debit / Received", value: sum(output, "debit") },
      { label: "Credit / Paid", value: sum(output, "credit") },
      { label: "Net Movement", value: money(sum(output, "debit") - sum(output, "credit")) },
      { label: "Transactions", value: output.length },
    ],
  );
}

async function paymentReceiptMethods(businessId: string, query: any) {
  const { from, to } = range(query);
  const [customerPayments, supplierPayments, refunds, expenses, accounts] = await Promise.all([
    prisma.customerPayment.findMany({ where: { businessId, paymentDate: { gte: from, lte: to } }, orderBy: { paymentDate: "desc" } }),
    prisma.supplierPayment.findMany({ where: { businessId, paymentDate: { gte: from, lte: to } }, orderBy: { paymentDate: "desc" } }),
    prisma.customerRefund.findMany({ where: { businessId, refundDate: { gte: from, lte: to } }, orderBy: { refundDate: "desc" } }),
    prisma.expense.findMany({ where: { businessId, expenseDate: { gte: from, lte: to } }, orderBy: { expenseDate: "desc" } }),
    prisma.account.findMany({ where: { businessId }, select: { id: true, name: true } }),
  ]);
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const rows = [
    ...customerPayments.map((payment) => ({
      date: payment.paymentDate, direction: "received", source: "customer receipt", reference: payment.receiptNo,
      party: payment.customerName, method: normalizeMethod(payment.method), account: accountNames.get(payment.accountId || "") || "Unassigned account",
      received: money(payment.amount), paid: 0,
    })),
    ...supplierPayments.map((payment) => ({
      date: payment.paymentDate, direction: "paid", source: "supplier payment", reference: payment.voucherNo,
      party: payment.supplierName, method: normalizeMethod(payment.method), account: accountNames.get(payment.accountId || "") || "Unassigned account",
      received: 0, paid: money(payment.amount),
    })),
    ...refunds.map((refund) => ({
      date: refund.refundDate, direction: "paid", source: "customer refund", reference: refund.refundNo,
      party: refund.customerName, method: normalizeMethod(refund.method), account: accountNames.get(refund.accountId || "") || "Unassigned account",
      received: 0, paid: money(refund.amount),
    })),
    ...expenses.map((expense) => ({
      date: expense.expenseDate, direction: "paid", source: "expense", reference: expense.referenceNo || "-",
      party: expense.category, method: normalizeMethod((expense.metadata as any)?.paymentMethod || "unspecified"), account: accountNames.get(expense.accountId || "") || "Unassigned account",
      received: 0, paid: money(expense.amount),
    })),
  ].map((row) => ({ ...row, net: money(row.received - row.paid) }));

  const methodFilter = normalizeMethod(query?.paymentMethod || "");
  const directionFilter = String(query?.direction || "").trim().toLowerCase();
  const filtered = rows.filter((row) => (!query?.paymentMethod || row.method === methodFilter)
    && (!directionFilter || row.direction === directionFilter));
  filtered.sort((a, b) => b.date.getTime() - a.date.getTime());

  const methodTotals = new Map<string, { received: number; paid: number; count: number }>();
  for (const row of filtered) {
    const current = methodTotals.get(row.method) || { received: 0, paid: 0, count: 0 };
    current.received += row.received;
    current.paid += row.paid;
    current.count += 1;
    methodTotals.set(row.method, current);
  }
  const totalMovement = filtered.reduce((total, row) => total + row.received + row.paid, 0);
  const summary = [...methodTotals.entries()].sort((a, b) => (b[1].received + b[1].paid) - (a[1].received + a[1].paid)).flatMap(([method, totals]) => [
    { label: `${method} received`, value: money(totals.received) },
    { label: `${method} paid`, value: money(totals.paid) },
  ]);
  summary.push(
    { label: "Total Received", value: sum(filtered, "received") },
    { label: "Total Paid", value: sum(filtered, "paid") },
    { label: "Net Movement", value: money(sum(filtered, "received") - sum(filtered, "paid")) },
    { label: "Transactions", value: filtered.length },
  );

  const output = filtered.map((row) => ({
    ...row,
    movementPct: percent(row.received + row.paid, totalMovement),
  }));

  return report(
    "Payments / Receipts by Method",
    [
      { key: "date", label: "Date" }, { key: "direction", label: "Direction" },
      { key: "source", label: "Transaction" }, { key: "reference", label: "Reference" },
      { key: "party", label: "Party" }, { key: "method", label: "Method" },
      { key: "account", label: "Account" }, { key: "received", label: "Received" },
      { key: "paid", label: "Paid" }, { key: "net", label: "Net" },
      { key: "movementPct", label: "Movement %" },
    ],
    output,
    summary,
  );
}

export function isFinancialMovementReport(reportId: string): boolean {
  return REPORT_IDS.has(String(reportId || "").trim().toLowerCase());
}

export async function runFinancialMovementReport(businessId: string, reportId: string, query: any = {}) {
  const id = String(reportId || "").trim().toLowerCase();
  if (id === "transaction-ledger" || id === "general-ledger") return transactionLedger(businessId, query);
  if (id === "payment-receipt-methods") return paymentReceiptMethods(businessId, query);
  throw new ApiError(404, "Unknown financial movement report");
}
