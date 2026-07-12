import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "./audit.service.js";
import { ApiError, booleanValue, cleanString, dateRange, dateValue, numberValue, plain, queryLimit, requireText, roundMoney } from "../utils/http.js";

function normalizeType(value: unknown): string {
  const type = String(value || "cash").trim().toLowerCase().replace(/\s+/g, "_");
  return type || "cash";
}

function signedAmount(type: string, amount: number): number {
  return ["debit", "deposit", "receipt", "income", "opening", "adjustment_in"].includes(type.toLowerCase()) ? amount : -amount;
}

export async function listAccounts(businessId: string, query: any = {}) {
  const active = query.active === undefined ? undefined : booleanValue(query.active, true);
  const rows = await prisma.account.findMany({
    where: { businessId, ...(active === undefined ? {} : { active }), ...(cleanString(query.type) ? { type: normalizeType(query.type) } : {}) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const totals = rows.reduce((a, row) => {
    const balance = Number(row.currentBalance || 0);
    a.balance += balance;
    if (balance >= 0) a.positive += balance; else a.negative += Math.abs(balance);
    return a;
  }, { balance: 0, positive: 0, negative: 0 });
  return { accounts: plain(rows), totals: { balance: roundMoney(totals.balance), positive: roundMoney(totals.positive), negative: roundMoney(totals.negative) } };
}

export async function getAccount(businessId: string, id: string) {
  const row = await prisma.account.findFirst({ where: { id, businessId } });
  if (!row) throw new ApiError(404, "Account not found");
  return plain(row);
}

export async function createAccount(req: Request, businessId: string, userId: string | null, input: any) {
  const name = requireText(input.name, "Account name");
  const openingBalance = roundMoney(numberValue(input.openingBalance ?? input.balance));
  return prisma.$transaction(async (tx) => {
    const row = await tx.account.create({ data: {
      businessId, name, type: normalizeType(input.type), accountNumber: cleanString(input.accountNumber),
      bankName: cleanString(input.bankName), currency: cleanString(input.currency) || "QAR",
      openingBalance, currentBalance: openingBalance, active: booleanValue(input.active, true),
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : undefined,
    }});
    if (openingBalance !== 0) await tx.accountTransaction.create({ data: {
      businessId, accountId: row.id, type: openingBalance >= 0 ? "opening" : "opening_out",
      amount: Math.abs(openingBalance), description: "Opening balance", sourceType: "account", sourceId: row.id, createdByUserId: userId,
    }});
    await writeAudit(tx, req, { businessId, userId, action: "account.create", entityType: "Account", entityId: row.id, after: row });
    return plain(row);
  });
}

export async function updateAccount(req: Request, businessId: string, userId: string | null, id: string, input: any) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.account.findFirst({ where: { id, businessId } });
    if (!before) throw new ApiError(404, "Account not found");
    const row = await tx.account.update({ where: { id }, data: {
      name: cleanString(input.name), type: input.type === undefined ? undefined : normalizeType(input.type),
      accountNumber: input.accountNumber === undefined ? undefined : cleanString(input.accountNumber) || null,
      bankName: input.bankName === undefined ? undefined : cleanString(input.bankName) || null,
      currency: cleanString(input.currency), active: input.active === undefined ? undefined : booleanValue(input.active),
      metadata: input.metadata === undefined ? undefined : input.metadata,
    }});
    await writeAudit(tx, req, { businessId, userId, action: "account.update", entityType: "Account", entityId: id, before, after: row });
    return plain(row);
  });
}

export async function deleteAccount(req: Request, businessId: string, userId: string | null, id: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.account.findFirst({ where: { id, businessId } });
    if (!before) throw new ApiError(404, "Account not found");
    const linked = await tx.accountTransaction.count({ where: { businessId, accountId: id } });
    const row = linked ? await tx.account.update({ where: { id }, data: { active: false } }) : await tx.account.delete({ where: { id } });
    await writeAudit(tx, req, { businessId, userId, action: linked ? "account.deactivate" : "account.delete", entityType: "Account", entityId: id, before, after: row });
    return { id, deleted: !linked, deactivated: Boolean(linked) };
  });
}

export async function listTransactions(businessId: string, query: any = {}) {
  const { from, to } = dateRange(query.from, query.to, 90);
  const rows = await prisma.accountTransaction.findMany({
    where: { businessId, ...(cleanString(query.accountId) ? { accountId: cleanString(query.accountId) } : {}), transactionDate: { gte: from, lte: to } },
    include: { account: { select: { id: true, name: true, type: true } } },
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }], take: queryLimit(query.limit, 250, 1000),
  });
  return plain(rows);
}

export async function createTransaction(req: Request, businessId: string, userId: string | null, input: any) {
  const accountId = requireText(input.accountId, "Account");
  const amount = roundMoney(Math.abs(numberValue(input.amount)));
  if (amount <= 0) throw new ApiError(400, "Amount must be greater than zero");
  const type = normalizeType(input.type || "deposit");
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.findFirst({ where: { id: accountId, businessId, active: true } });
    if (!account) throw new ApiError(404, "Account not found");
    const change = signedAmount(type, amount);
    const row = await tx.accountTransaction.create({ data: {
      businessId, accountId, type, amount, referenceNo: cleanString(input.referenceNo), description: cleanString(input.description),
      transactionDate: dateValue(input.transactionDate) || new Date(), sourceType: cleanString(input.sourceType) || "manual",
      sourceId: cleanString(input.sourceId), createdByUserId: userId,
    }});
    const updated = await tx.account.update({ where: { id: accountId }, data: { currentBalance: { increment: change } } });
    await writeAudit(tx, req, { businessId, userId, action: "account.transaction.create", entityType: "AccountTransaction", entityId: row.id, after: row });
    return { transaction: plain(row), account: plain(updated) };
  });
}

export async function reconcile(req: Request, businessId: string, userId: string | null, id: string, input: any) {
  const target = roundMoney(numberValue(input.balance ?? input.currentBalance));
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.findFirst({ where: { id, businessId } });
    if (!account) throw new ApiError(404, "Account not found");
    const current = Number(account.currentBalance || 0);
    const difference = roundMoney(target - current);
    if (difference !== 0) await tx.accountTransaction.create({ data: {
      businessId, accountId: id, type: difference > 0 ? "adjustment_in" : "adjustment_out", amount: Math.abs(difference),
      description: cleanString(input.description) || "Account reconciliation", transactionDate: dateValue(input.date) || new Date(),
      sourceType: "reconciliation", sourceId: id, createdByUserId: userId,
    }});
    const updated = await tx.account.update({ where: { id }, data: { currentBalance: target } });
    await writeAudit(tx, req, { businessId, userId, action: "account.reconcile", entityType: "Account", entityId: id, before: account, after: updated });
    return { account: plain(updated), adjustment: difference };
  });
}
