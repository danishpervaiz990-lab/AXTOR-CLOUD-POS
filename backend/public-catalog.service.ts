import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "./audit.service.js";
import { ApiError, booleanValue, cleanString, dateValue, monthRange, numberValue, plain, requireText, roundMoney } from "../utils/http.js";

function normalizeTiers(value: unknown): Array<{ from: number; to: number; rate: number }> {
  if (!Array.isArray(value)) return [];
  return value.map((tier: any) => ({ from: numberValue(tier?.from), to: numberValue(tier?.to, 999), rate: numberValue(tier?.rate) })).sort((a, b) => a.from - b.from);
}

function commissionFor(actualSales: number, targetAmount: number, tiers: any, bonus: number) {
  const achievementPct = targetAmount > 0 ? (actualSales / targetAmount) * 100 : 0;
  const normalized = normalizeTiers(tiers);
  const tier = [...normalized].reverse().find((item) => achievementPct >= item.from) || { rate: 0 };
  const commissionAmount = roundMoney(actualSales * tier.rate / 100);
  const bonusAmount = achievementPct >= 100 ? roundMoney(bonus) : 0;
  return { achievementPct: roundMoney(achievementPct), commissionRate: tier.rate, commissionAmount, bonusAmount, totalPayout: roundMoney(commissionAmount + bonusAmount) };
}

async function performanceForSalesman(businessId: string, salesman: any, month: string) {
  const { start, end } = monthRange(month);
  const [target, sales] = await Promise.all([
    prisma.salesmanTarget.findUnique({ where: { businessId_salesmanId_month: { businessId, salesmanId: salesman.id, month } } }),
    prisma.salesDocument.aggregate({
      where: { businessId, salesmanId: salesman.id, documentType: "INVOICE", status: { notIn: ["DRAFT", "CANCELLED", "VOID"] }, createdAt: { gte: start, lt: end } },
      _sum: { total: true }, _count: { _all: true },
    }),
  ]);
  const actualSales = Number(sales._sum.total || 0);
  const targetAmount = Number(target?.targetAmount || 0);
  const calculated = commissionFor(actualSales, targetAmount, target?.commissionTiers, Number(target?.bonusOnTarget || 0));
  return plain({ salesman, target, month, actualSales: roundMoney(actualSales), invoiceCount: sales._count._all, targetAmount, targetInvoices: target?.targetInvoices || 0, ...calculated });
}

export async function listSalesmen(businessId: string, query: any) {
  const month = monthRange(query.month).month;
  const where: any = { businessId };
  if (cleanString(query.branchId)) where.branchId = cleanString(query.branchId);
  if (query.active !== undefined) where.active = booleanValue(query.active, true);
  const rows = await prisma.salesman.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return Promise.all(rows.map((row) => performanceForSalesman(businessId, row, month)));
}

export async function getSalesman(businessId: string, id: string, monthInput?: unknown) {
  const salesman = await prisma.salesman.findFirst({ where: { id, businessId } });
  if (!salesman) throw new ApiError(404, "Salesman not found");
  return performanceForSalesman(businessId, salesman, monthRange(monthInput).month);
}

export async function createSalesman(req: Request, businessId: string, userId: string | null, input: any) {
  const name = requireText(input.name, "Salesman name");
  return prisma.$transaction(async (tx) => {
    const branchId = cleanString(input.branchId) || null;
    const branch = branchId ? await tx.branch.findFirst({ where: { id: branchId, businessId } }) : null;
    if (branchId && !branch) throw new ApiError(400, "Selected branch is invalid");
    const row = await tx.salesman.create({ data: {
      businessId, userId: cleanString(input.userId) || null, branchId, branchName: branch?.name || cleanString(input.branchName) || null,
      name, phone: cleanString(input.phone) || null, email: cleanString(input.email) || null,
      joinDate: dateValue(input.joinDate) || null, baseCommissionRate: numberValue(input.baseCommissionRate), active: booleanValue(input.active, true),
    }});
    await writeAudit(tx, req, { businessId, userId, action: "salesman.create", entityType: "Salesman", entityId: row.id, after: plain(row) });
    return plain(row);
  });
}

export async function updateSalesman(req: Request, businessId: string, userId: string | null, id: string, input: any) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.salesman.findFirst({ where: { id, businessId } });
    if (!before) throw new ApiError(404, "Salesman not found");
    const branchId = input.branchId === undefined ? before.branchId : cleanString(input.branchId) || null;
    const branch = branchId ? await tx.branch.findFirst({ where: { id: branchId, businessId } }) : null;
    if (branchId && !branch) throw new ApiError(400, "Selected branch is invalid");
    const row = await tx.salesman.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: requireText(input.name, "Salesman name") } : {}),
      ...(input.phone !== undefined ? { phone: cleanString(input.phone) || null } : {}),
      ...(input.email !== undefined ? { email: cleanString(input.email) || null } : {}),
      ...(input.userId !== undefined ? { userId: cleanString(input.userId) || null } : {}),
      ...(input.joinDate !== undefined ? { joinDate: dateValue(input.joinDate) || null } : {}),
      ...(input.baseCommissionRate !== undefined ? { baseCommissionRate: numberValue(input.baseCommissionRate) } : {}),
      ...(input.active !== undefined ? { active: booleanValue(input.active, before.active) } : {}),
      ...(input.branchId !== undefined ? { branchId, branchName: branch?.name || null } : {}),
    }});
    await writeAudit(tx, req, { businessId, userId, action: "salesman.update", entityType: "Salesman", entityId: id, before: plain(before), after: plain(row) });
    return plain(row);
  });
}

export async function deleteSalesman(req: Request, businessId: string, userId: string | null, id: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.salesman.findFirst({ where: { id, businessId } });
    if (!before) throw new ApiError(404, "Salesman not found");
    const row = await tx.salesman.update({ where: { id }, data: { active: false } });
    await writeAudit(tx, req, { businessId, userId, action: "salesman.deactivate", entityType: "Salesman", entityId: id, before: plain(before), after: plain(row) });
    return plain(row);
  });
}

export async function upsertTarget(req: Request, businessId: string, userId: string | null, salesmanId: string, input: any) {
  const salesman = await prisma.salesman.findFirst({ where: { id: salesmanId, businessId } });
  if (!salesman) throw new ApiError(404, "Salesman not found");
  const month = monthRange(input.month).month;
  return prisma.$transaction(async (tx) => {
    const before = await tx.salesmanTarget.findUnique({ where: { businessId_salesmanId_month: { businessId, salesmanId, month } } });
    const row = await tx.salesmanTarget.upsert({
      where: { businessId_salesmanId_month: { businessId, salesmanId, month } },
      create: { businessId, salesmanId, month, targetAmount: numberValue(input.targetAmount), targetInvoices: Math.max(0, Math.floor(numberValue(input.targetInvoices))), commissionTiers: normalizeTiers(input.commissionTiers), bonusOnTarget: numberValue(input.bonusOnTarget), notes: cleanString(input.notes) || null },
      update: { targetAmount: numberValue(input.targetAmount), targetInvoices: Math.max(0, Math.floor(numberValue(input.targetInvoices))), commissionTiers: normalizeTiers(input.commissionTiers), bonusOnTarget: numberValue(input.bonusOnTarget), notes: cleanString(input.notes) || null },
    });
    await writeAudit(tx, req, { businessId, userId, action: "salesman.target.upsert", entityType: "SalesmanTarget", entityId: row.id, before: plain(before), after: plain(row) });
    return performanceForSalesman(businessId, salesman, month);
  });
}

export async function copyTargets(req: Request, businessId: string, userId: string | null, fromMonthInput: unknown, toMonthInput: unknown) {
  const fromMonth = monthRange(fromMonthInput).month;
  const toMonth = monthRange(toMonthInput).month;
  if (fromMonth === toMonth) throw new ApiError(400, "Source and destination months must be different");
  return prisma.$transaction(async (tx) => {
    const targets = await tx.salesmanTarget.findMany({ where: { businessId, month: fromMonth } });
    let copied = 0;
    for (const target of targets) {
      await tx.salesmanTarget.upsert({
        where: { businessId_salesmanId_month: { businessId, salesmanId: target.salesmanId, month: toMonth } },
        create: { businessId, salesmanId: target.salesmanId, month: toMonth, targetAmount: target.targetAmount, targetInvoices: target.targetInvoices, commissionTiers: target.commissionTiers as any, bonusOnTarget: target.bonusOnTarget, notes: target.notes },
        update: { targetAmount: target.targetAmount, targetInvoices: target.targetInvoices, commissionTiers: target.commissionTiers as any, bonusOnTarget: target.bonusOnTarget, notes: target.notes },
      });
      copied += 1;
    }
    await writeAudit(tx, req, { businessId, userId, action: "salesman.targets.copy", entityType: "SalesmanTarget", after: { fromMonth, toMonth, copied } });
    return { fromMonth, toMonth, copied };
  });
}

export async function performanceReport(businessId: string, monthInput: unknown) {
  const month = monthRange(monthInput).month;
  const salesmen = await prisma.salesman.findMany({ where: { businessId, active: true }, orderBy: { name: "asc" } });
  const rows = await Promise.all(salesmen.map((row) => performanceForSalesman(businessId, row, month)));
  const summary = rows.reduce((acc, row: any) => {
    acc.teamSales += row.actualSales; acc.commissionsDue += row.totalPayout; acc.avgAchievement += row.achievementPct; return acc;
  }, { teamSales: 0, commissionsDue: 0, avgAchievement: 0 });
  summary.avgAchievement = rows.length ? roundMoney(summary.avgAchievement / rows.length) : 0;
  return { month, summary: { ...summary, teamSales: roundMoney(summary.teamSales), commissionsDue: roundMoney(summary.commissionsDue) }, rows };
}

export async function listPayouts(businessId: string, monthInput: unknown, ensure = true) {
  const month = monthRange(monthInput).month;
  if (ensure) {
    const report = await performanceReport(businessId, month);
    await prisma.$transaction(async (tx) => {
      for (const row of report.rows as any[]) {
        await tx.commissionPayout.upsert({
          where: { businessId_salesmanId_month: { businessId, salesmanId: row.salesman.id, month } },
          create: { businessId, salesmanId: row.salesman.id, month, grossSales: row.actualSales, achievementPct: row.achievementPct, commissionRate: row.commissionRate, commissionAmount: row.commissionAmount, bonusAmount: row.bonusAmount, totalPayout: row.totalPayout },
          update: { grossSales: row.actualSales, achievementPct: row.achievementPct, commissionRate: row.commissionRate, commissionAmount: row.commissionAmount, bonusAmount: row.bonusAmount, totalPayout: row.totalPayout },
        });
      }
    });
  }
  const rows = await prisma.commissionPayout.findMany({ where: { businessId, month }, include: { salesman: true }, orderBy: { totalPayout: "desc" } });
  return plain(rows);
}

export async function updatePayout(req: Request, businessId: string, userId: string | null, id: string, input: any) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.commissionPayout.findFirst({ where: { id, businessId } });
    if (!before) throw new ApiError(404, "Commission payout not found");
    const status = cleanString(input.status)?.toLowerCase();
    const allowed = ["pending", "approved", "paid", "disputed"];
    if (status && !allowed.includes(status)) throw new ApiError(400, "Invalid payout status");
    const row = await tx.commissionPayout.update({ where: { id }, data: {
      ...(status ? { status } : {}),
      ...(status === "approved" ? { approvedByUserId: userId } : {}),
      ...(status === "paid" ? { paidDate: dateValue(input.paidDate) || new Date(), paymentMethod: cleanString(input.paymentMethod) || null } : {}),
      ...(input.notes !== undefined ? { notes: cleanString(input.notes) || null } : {}),
      ...(input.disputed !== undefined ? { disputed: booleanValue(input.disputed), disputeReason: cleanString(input.disputeReason) || null } : {}),
    }, include: { salesman: true } });
    await writeAudit(tx, req, { businessId, userId, action: "commission.payout.update", entityType: "CommissionPayout", entityId: id, before: plain(before), after: plain(row) });
    return plain(row);
  });
}
