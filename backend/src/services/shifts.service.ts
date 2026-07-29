import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "./audit.service.js";
import { ApiError, cleanString, dateRange, numberValue, plain, queryLimit, roundMoney } from "../utils/http.js";
import { initialPaymentBreakdown, transactionBelongsToShift } from "./retail-accounting.helpers.js";

const saleStatuses: any = { notIn: ["CANCELLED", "VOID", "DRAFT"] };

async function calculate(businessId: string, shift: any, end = new Date()) {
  const where: any = { businessId, status: saleStatuses, createdAt: { gte: shift.openedAt, lte: end } };
  if (shift.branchId) where.branchId = shift.branchId;
  if (shift.counterId) where.counterId = shift.counterId;
  else if (shift.cashierUserId) where.createdByUserId = shift.cashierUserId;

  const [docs, payments, refunds, expenses] = await Promise.all([
    prisma.salesDocument.findMany({
      where,
      select: { id: true, documentNo: true, total: true, paid: true, balance: true, paymentMethod: true, status: true, metadata: true, createdAt: true },
    }),
    prisma.customerPayment.findMany({
      where: { businessId, paymentDate: { gte: shift.openedAt, lte: end } },
      select: { amount: true, method: true, allocation: true, paymentDate: true },
    }),
    prisma.customerRefund.findMany({
      where: { businessId, refundDate: { gte: shift.openedAt, lte: end } },
      select: { amount: true, method: true, metadata: true, refundDate: true },
    }),
    prisma.expense.findMany({
      where: { businessId, expenseDate: { gte: shift.openedAt, lte: end }, ...(shift.branchId ? { branchId: shift.branchId } : {}) },
      select: { amount: true, metadata: true, category: true },
    }),
  ]);

  let cashSales = 0;
  let cardSales = 0;
  let bankSales = 0;
  let creditSales = 0;
  let otherSales = 0;
  let totalSales = 0;

  for (const document of docs) {
    totalSales += Number(document.total || 0);
    const breakdown = initialPaymentBreakdown(document);
    cashSales += breakdown.cash;
    cardSales += breakdown.card;
    bankSales += breakdown.bank;
    otherSales += breakdown.other;
    creditSales += breakdown.credit;
  }

  const cashReceipts = payments
    .filter((payment) => transactionBelongsToShift(payment, shift.id, "receive_payment"))
    .filter((payment) => String(payment.method || "").toLowerCase().includes("cash"))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const cashRefunds = refunds
    .filter((refund) => transactionBelongsToShift(refund, shift.id, "customer_refund"))
    .filter((refund) => String(refund.method || "").toLowerCase().includes("cash"))
    .reduce((sum, refund) => sum + Number(refund.amount || 0), 0);

  const cashExpenses = expenses.reduce((sum, expense) => {
    const metadata: any = expense.metadata || {};
    return sum + (metadata.paymentMethod && String(metadata.paymentMethod).toLowerCase() !== "cash" ? 0 : Number(expense.amount || 0));
  }, 0);

  const expectedCash = roundMoney(Number(shift.openingCash || 0) + cashSales + cashReceipts - cashRefunds - cashExpenses);
  return {
    openingCash: Number(shift.openingCash || 0),
    expectedCash,
    totalSales: roundMoney(totalSales),
    invoiceCount: docs.length,
    cashSales: roundMoney(cashSales),
    cardSales: roundMoney(cardSales),
    bankSales: roundMoney(bankSales),
    creditSales: roundMoney(creditSales),
    otherSales: roundMoney(otherSales),
    cashReceipts: roundMoney(cashReceipts),
    cashRefunds: roundMoney(cashRefunds),
    cashExpenses: roundMoney(cashExpenses),
    documents: plain(docs),
  };
}

export async function listShifts(businessId: string, q: any = {}) {
  const { from, to } = dateRange(q.from, q.to, 30);
  const rows = await prisma.shift.findMany({
    where: {
      businessId,
      openedAt: { gte: from, lte: to },
      ...(cleanString(q.status) ? { status: String(q.status).toUpperCase() as any } : {}),
      ...(cleanString(q.branchId) ? { branchId: cleanString(q.branchId) } : {}),
    },
    include: { branch: true, counter: true },
    orderBy: { openedAt: "desc" },
    take: queryLimit(q.limit, 200, 1000),
  });
  return plain(rows);
}

export async function currentShift(businessId: string, userId: string | null, q: any = {}) {
  const row = await prisma.shift.findFirst({
    where: {
      businessId,
      status: "OPEN",
      ...(cleanString(q.counterId) ? { counterId: cleanString(q.counterId) } : userId ? { OR: [{ cashierUserId: userId }, { openedByUserId: userId }] } : {}),
    },
    include: { branch: true, counter: true },
    orderBy: { openedAt: "desc" },
  });
  if (!row) return null;
  return { ...plain(row), summary: await calculate(businessId, row) };
}

export async function openShift(req: Request, businessId: string, userId: string | null, input: any) {
  return prisma.$transaction(async (tx) => {
    const counterId = cleanString(input.counterId) || null;
    const existing = await tx.shift.findFirst({ where: { businessId, status: "OPEN", ...(counterId ? { counterId } : userId ? { OR: [{ cashierUserId: userId }, { openedByUserId: userId }] } : {}) } });
    if (existing) throw new ApiError(409, "An open shift already exists for this counter/cashier");
    let counter: any = null;
    if (counterId) {
      counter = await tx.counter.findFirst({ where: { id: counterId, businessId } });
      if (!counter) throw new ApiError(404, "Counter not found");
    }
    const branchId = cleanString(input.branchId) || counter?.branchId || null;
    let cashierName = cleanString(input.cashierName);
    if (!cashierName && userId) {
      const user = await tx.user.findFirst({ where: { id: userId, businessId }, select: { name: true } });
      cashierName = user?.name || undefined;
    }
    const row = await tx.shift.create({ data: { businessId, branchId, counterId, cashierUserId: cleanString(input.cashierUserId) || userId, cashierName, counterName: cleanString(input.counterName) || counter?.name, openedByUserId: userId, openingCash: roundMoney(numberValue(input.openingCash)), notes: cleanString(input.notes) } });
    await writeAudit(tx, req, { businessId, userId, action: "shift.open", entityType: "Shift", entityId: row.id, after: row });
    return plain(row);
  });
}

export async function getSummary(businessId: string, id: string) {
  const row = await prisma.shift.findFirst({ where: { id, businessId }, include: { branch: true, counter: true } });
  if (!row) throw new ApiError(404, "Shift not found");
  const summary = await calculate(businessId, row, row.closedAt || new Date());
  return { ...plain(row), summary, closingCash: row.closingCash === null ? null : Number(row.closingCash), variance: row.variance === null ? null : Number(row.variance) };
}

export async function closeShift(req: Request, businessId: string, userId: string | null, id: string, input: any) {
  const existing = await prisma.shift.findFirst({ where: { id, businessId } });
  if (!existing) throw new ApiError(404, "Shift not found");
  if (existing.status !== "OPEN") throw new ApiError(409, "Shift is already closed");
  const calculated = await calculate(businessId, existing);
  const closingCash = roundMoney(numberValue(input.closingCash));
  const variance = roundMoney(closingCash - calculated.expectedCash);
  return prisma.$transaction(async (tx) => {
    const row = await tx.shift.update({ where: { id }, data: { closingCash, expectedCash: calculated.expectedCash, variance, status: "CLOSED", closedAt: new Date(), closedByUserId: userId, notes: cleanString(input.notes) || existing.notes } });
    await writeAudit(tx, req, { businessId, userId, action: "shift.close", entityType: "Shift", entityId: id, before: existing, after: row });
    return { ...plain(row), summary: calculated };
  });
}
