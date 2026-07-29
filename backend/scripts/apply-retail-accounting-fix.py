from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

helper = '''export type PaymentBreakdown = {
  cash: number;
  card: number;
  bank: number;
  other: number;
  initialPaid: number;
  credit: number;
};

export function jsonRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function classify(methodValue: unknown, amount: number, totals: PaymentBreakdown) {
  const method = String(methodValue || "cash").toLowerCase();
  if (method.includes("cash")) totals.cash += amount;
  else if (method.includes("card")) totals.card += amount;
  else if (method.includes("bank")) totals.bank += amount;
  else totals.other += amount;
}

export function initialPaymentBreakdown(document: any): PaymentBreakdown {
  const total = Number(document?.total || 0);
  const metadata = jsonRecord(document?.metadata);
  const lines = Array.isArray(metadata.paymentLines) ? metadata.paymentLines : [];
  const result: PaymentBreakdown = { cash: 0, card: 0, bank: 0, other: 0, initialPaid: 0, credit: 0 };

  if (lines.length) {
    for (const line of lines) {
      const amount = Math.max(0, Number(line?.amount || 0));
      result.initialPaid += amount;
      classify(line?.method, amount, result);
    }
  } else {
    const paid = Math.max(0, Math.min(total, Number(document?.paid || 0)));
    result.initialPaid = paid;
    classify(document?.paymentMethod, paid, result);
  }

  result.initialPaid = Math.min(total, result.initialPaid);
  result.credit = Math.max(0, total - result.initialPaid);
  return result;
}

export function transactionBelongsToShift(record: any, shiftId: string, expectedSource: string): boolean {
  const metadata = jsonRecord(record?.allocation ?? record?.metadata);
  const source = String(metadata.source || "").toLowerCase();
  return String(metadata.shiftId || "") === String(shiftId) && source === expectedSource.toLowerCase();
}

export function profitLossAfterReturns(input: {
  grossRevenue: number;
  grossCogs: number;
  returnedRevenue: number;
  returnedCogs: number;
  expenses: number;
}) {
  const revenue = input.grossRevenue - input.returnedRevenue;
  const cogs = input.grossCogs - input.returnedCogs;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - input.expenses;
  return { revenue, cogs, grossProfit, netProfit };
}
'''
(ROOT / 'backend/src/services/retail-accounting.helpers.ts').write_text(helper)

shifts = '''import type { Request } from "express";
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
'''
(ROOT / 'backend/src/services/shifts.service.ts').write_text(shifts)

sales_path = ROOT / 'backend/src/controllers/sales-documents.controller.ts'
sales = sales_path.read_text()
old = '          source: "sales_document_posting",\n'
new = '''          shiftId: input.document.shiftId || null,
          counterId: input.document.counterId || null,
          branchId: input.document.branchId || null,
          createdByUserId: input.document.createdByUserId || null,
          source: "sales_document_posting",
'''
if old not in sales:
    raise SystemExit('sales document payment allocation marker not found')
sales_path.write_text(sales.replace(old, new, 1))

payments_path = ROOT / 'backend/src/controllers/payments.controller.ts'
payments = payments_path.read_text()
access_marker = '      const access = await loadUserAccess(tx, businessId, getUserId(req));\n      requirePermission(access, "payments.create", true);\n'
access_replacement = '''      const access = await loadUserAccess(tx, businessId, getUserId(req));
      requirePermission(access, "payments.create", true);
      const requestedShiftId = cleanString(req.body?.shiftId);
      const activeShift = await tx.shift.findFirst({
        where: {
          businessId,
          status: "OPEN",
          ...(requestedShiftId ? { id: requestedShiftId } : {}),
          OR: [{ cashierUserId: access.userId }, { openedByUserId: access.userId }],
        },
        orderBy: { openedAt: "desc" },
      });
      if (requestedShiftId && !activeShift) throw new Error("Selected shift is not open for the current user");
'''
if access_marker not in payments:
    raise SystemExit('payment access marker not found')
payments = payments.replace(access_marker, access_replacement, 1)
allocation_marker = '''            notes: cleanString(req.body?.notes) ?? null,
          },
'''
allocation_replacement = '''            notes: cleanString(req.body?.notes) ?? null,
            source: "receive_payment",
            shiftId: activeShift?.id ?? null,
            counterId: activeShift?.counterId ?? null,
            branchId: activeShift?.branchId ?? invoice.branchId ?? null,
            createdByUserId: access.userId,
          },
'''
if allocation_marker not in payments:
    raise SystemExit('payment allocation marker not found')
payments_path.write_text(payments.replace(allocation_marker, allocation_replacement, 1))

refunds_path = ROOT / 'backend/src/controllers/refunds.controller.ts'
refunds = refunds_path.read_text()
refund_access = '      const access=await loadUserAccess(tx,bid,userId(req));\n      requirePermission(access,"sales_documents.refund",true);\n'
refund_access_new = '''      const access=await loadUserAccess(tx,bid,userId(req));
      requirePermission(access,"sales_documents.refund",true);
      const activeShift=await tx.shift.findFirst({where:{businessId:bid,status:"OPEN",OR:[{cashierUserId:access.userId},{openedByUserId:access.userId}]},orderBy:{openedAt:"desc"}});
'''
if refund_access not in refunds:
    raise SystemExit('refund access marker not found')
refunds = refunds.replace(refund_access, refund_access_new, 1)
old_meta = 'metadata:{createdById:userId(req)||null,source:"api"}'
new_meta = 'metadata:{createdById:userId(req)||null,createdByUserId:access.userId,source:"customer_refund",shiftId:activeShift?.id||null,counterId:activeShift?.counterId||null,branchId:activeShift?.branchId||doc.branchId||null}'
if old_meta not in refunds:
    raise SystemExit('refund metadata marker not found')
refunds_path.write_text(refunds.replace(old_meta, new_meta, 1))

reports_path = ROOT / 'backend/src/services/reports.service.ts'
reports = reports_path.read_text()
import_marker = 'import{ApiError,cleanString,dateRange,monthRange,plain,roundMoney}from"../utils/http.js";\n'
if import_marker not in reports:
    raise SystemExit('reports import marker not found')
reports = reports.replace(import_marker, import_marker + 'import{profitLossAfterReturns}from"./retail-accounting.helpers.js";\n', 1)
new_profit_case = '''case"profit-loss":{const docs=await sales(businessId,q,true),{from,to}=range(q),[expenses,returns]=await Promise.all([prisma.expense.findMany({where:{businessId,expenseDate:{gte:from,lte:to}}}),prisma.salesReturn.findMany({where:{businessId,returnDate:{gte:from,lte:to},status:{notIn:["CANCELLED","VOID"]}},include:{items:true}})]);let grossRevenue=0,grossCogs=0;const productIds=[...new Set([...docs.flatMap(d=>d.items.map((i:any)=>i.productId).filter(Boolean)),...returns.flatMap(r=>r.items.map((i:any)=>i.productId).filter(Boolean))])] as string[],ps=await prisma.product.findMany({where:{businessId,id:{in:productIds}},select:{id:true,costPrice:true}}),pm=new Map(ps.map(p=>[p.id,Number(p.costPrice)]));for(const d of docs){grossRevenue+=Number(d.total);for(const i of d.items)grossCogs+=(pm.get(i.productId||"")||0)*Number(i.qty)}const returnedRevenue=returns.reduce((a,r)=>a+Number(r.total||0),0),returnedCogs=returns.reduce((a,r)=>a+r.items.reduce((s:any,i:any)=>s+(pm.get(i.productId||"")||0)*Number(i.returnQty||0),0),0),exp=sum(expenses,"amount"),calculated=profitLossAfterReturns({grossRevenue,grossCogs,returnedRevenue,returnedCogs,expenses:exp}),revenue=money(calculated.revenue),cogs=money(calculated.cogs),gross=money(calculated.grossProfit),net=money(calculated.netProfit);return result("Profit & Loss Report",[{key:"line",label:"Account"},{key:"amount",label:"Amount"}],[{line:"Gross Sales Revenue",amount:money(grossRevenue)},{line:"Sales Returns",amount:money(-returnedRevenue)},{line:"Net Sales Revenue",amount:revenue},{line:"Cost of Goods Sold",amount:cogs},{line:"Gross Profit",amount:gross},{line:"Operating Expenses",amount:exp},{line:"Net Profit",amount:net}],[{label:"Revenue",value:revenue},{label:"Gross Profit",value:gross},{label:"Net Profit",value:net}]);}
'''
pattern = re.compile(r'case"profit-loss":\{.*?\}\ncase"trial-balance":', re.S)
if not pattern.search(reports):
    raise SystemExit('profit-loss case marker not found')
reports = pattern.sub(new_profit_case + 'case"trial-balance":', reports, count=1)
reports_path.write_text(reports)

test = '''import test from "node:test";
import assert from "node:assert/strict";
import { initialPaymentBreakdown, profitLossAfterReturns, transactionBelongsToShift } from "../dist/services/retail-accounting.helpers.js";

test("shift sales use original payment lines instead of later invoice paid total", () => {
  const breakdown = initialPaymentBreakdown({
    total: 1000,
    paid: 1000,
    paymentMethod: "cash",
    metadata: { paymentLines: [{ method: "cash", amount: 500 }] },
  });
  assert.deepEqual(breakdown, { cash: 500, card: 0, bank: 0, other: 0, initialPaid: 500, credit: 500 });
});

test("customer receipts are attributed only to their receiving shift", () => {
  assert.equal(transactionBelongsToShift({ allocation: { source: "receive_payment", shiftId: "shift-1" } }, "shift-1", "receive_payment"), true);
  assert.equal(transactionBelongsToShift({ allocation: { source: "receive_payment", shiftId: "shift-2" } }, "shift-1", "receive_payment"), false);
  assert.equal(transactionBelongsToShift({ allocation: { source: "sales_document_posting", shiftId: "shift-1" } }, "shift-1", "receive_payment"), false);
});

test("profit and loss reverses returned revenue and returned cost", () => {
  assert.deepEqual(profitLossAfterReturns({ grossRevenue: 100000, grossCogs: 60000, returnedRevenue: 2100, returnedCogs: 1200, expenses: 500 }), {
    revenue: 97900,
    cogs: 58800,
    grossProfit: 39100,
    netProfit: 38600,
  });
});
'''
(ROOT / 'backend/tests/retail-accounting-regressions.test.mjs').write_text(test)

print('Retail accounting fixes applied successfully')
