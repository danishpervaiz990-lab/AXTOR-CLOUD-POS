import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";

const db: any = prisma;
function text(v: unknown) { return String(v ?? "").trim(); }
function num(v: unknown, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function round2(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function round3(v: number) { return Math.round((v + Number.EPSILON) * 1000) / 1000; }
function json(v: unknown): Record<string, any> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {}; }
function asDate(v: unknown) { if (!v) return null; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d; }
function tenant(req: Request) { const businessId = req.tenant?.businessId; const userId = req.tenant?.userId; if (!businessId || !userId) throw new Error("Authenticated Grocery tenant is required"); return { businessId, userId }; }
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok: true, data }); }
function fail(res: Response, e: any, status = 400) { return res.status(status).json({ ok: false, error: { message: e?.message || "Request failed" } }); }

async function validateBranch(tx: any, businessId: string, branchId: string | null) {
  if (!branchId) return null;
  const row = await tx.branch.findFirst({ where: { id: branchId, businessId, active: true } });
  if (!row) throw new Error("Branch not found or inactive");
  return row;
}
async function validateUser(tx: any, businessId: string, userId: string | null) {
  if (!userId) return null;
  const row = await tx.user.findFirst({ where: { id: userId, businessId }, select: { id: true, name: true, email: true, status: true } });
  if (!row) throw new Error("Cashier user not found");
  return row;
}
async function validateWarehouse(tx: any, businessId: string, warehouseId: string | null) {
  if (!warehouseId) return null;
  const row = await tx.warehouse.findFirst({ where: { id: warehouseId, businessId, active: true } });
  if (!row) throw new Error("Default warehouse not found or inactive");
  return row;
}

export async function groceryCashiers(req: Request, res: Response) {
  try {
    const t = tenant(req);
    const users = await db.user.findMany({
      where: { businessId: t.businessId },
      select: { id: true, name: true, email: true, branchId: true, status: true, userRoles: { select: { role: { select: { name: true } } } } },
      orderBy: { name: "asc" },
      take: 500,
    });
    return ok(res, users.map((u: any) => ({ ...u, roles: (u.userRoles || []).map((r: any) => r.role?.name).filter(Boolean) })));
  } catch (e) { return fail(res, e); }
}

export async function createGroceryCounter(req: Request, res: Response) {
  try {
    const t = tenant(req);
    const result = await db.$transaction(async (tx: any) => {
      const name = text(req.body?.name); if (!name) throw new Error("Counter name is required");
      const branchId = text(req.body?.branchId) || null;
      const cashierUserId = text(req.body?.cashierUserId) || null;
      const defaultWarehouseId = text(req.body?.defaultWarehouseId) || null;
      await validateBranch(tx, t.businessId, branchId);
      const cashier = await validateUser(tx, t.businessId, cashierUserId);
      await validateWarehouse(tx, t.businessId, defaultWarehouseId);
      const counter = await tx.counter.create({ data: {
        businessId: t.businessId,
        branchId,
        name,
        code: text(req.body?.code) || null,
        cashierUserId,
        status: String(req.body?.status || "ACTIVE").toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      } });
      const profile = {
        defaultWarehouseId,
        terminalDevice: text(req.body?.terminalDevice) || null,
        printer: text(req.body?.printer) || null,
        cashDrawer: text(req.body?.cashDrawer) || null,
        assignedCashierName: cashier?.name || null,
      };
      await tx.industryRecord.create({ data: {
        businessId: t.businessId, industryCode: "grocery", entityType: "grocery_counter_profile",
        referenceNo: `COUNTER-${counter.id}`, displayName: counter.name, relatedEntityId: counter.id,
        status: "active", data: profile, createdByUserId: t.userId, updatedByUserId: t.userId,
      } });
      await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.counter.create", entityType: "Counter", entityId: counter.id, after: { ...counter, profile } });
      return { counter, profile };
    });
    return ok(res, result, 201);
  } catch (e) { return fail(res, e); }
}

export async function updateGroceryCounter(req: Request, res: Response) {
  try {
    const t = tenant(req);
    const result = await db.$transaction(async (tx: any) => {
      const before = await tx.counter.findFirst({ where: { id: req.params.id, businessId: t.businessId } });
      if (!before) throw new Error("Counter not found");
      const branchId = req.body?.branchId === undefined ? before.branchId : text(req.body.branchId) || null;
      const cashierUserId = req.body?.cashierUserId === undefined ? before.cashierUserId : text(req.body.cashierUserId) || null;
      await validateBranch(tx, t.businessId, branchId);
      const cashier = await validateUser(tx, t.businessId, cashierUserId);
      const counter = await tx.counter.update({ where: { id: before.id }, data: {
        ...(req.body?.name !== undefined ? { name: text(req.body.name) || before.name } : {}),
        ...(req.body?.code !== undefined ? { code: text(req.body.code) || null } : {}),
        branchId,
        cashierUserId,
        ...(req.body?.status !== undefined ? { status: String(req.body.status).toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE" } : {}),
      } });
      const existingProfile = await tx.industryRecord.findFirst({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_counter_profile", relatedEntityId: before.id, archivedAt: null } });
      const previous = json(existingProfile?.data);
      const defaultWarehouseId = req.body?.defaultWarehouseId === undefined ? text(previous.defaultWarehouseId) || null : text(req.body.defaultWarehouseId) || null;
      await validateWarehouse(tx, t.businessId, defaultWarehouseId);
      const profile = {
        ...previous,
        defaultWarehouseId,
        ...(req.body?.terminalDevice !== undefined ? { terminalDevice: text(req.body.terminalDevice) || null } : {}),
        ...(req.body?.printer !== undefined ? { printer: text(req.body.printer) || null } : {}),
        ...(req.body?.cashDrawer !== undefined ? { cashDrawer: text(req.body.cashDrawer) || null } : {}),
        assignedCashierName: cashier?.name || null,
      };
      if (existingProfile) await tx.industryRecord.update({ where: { id: existingProfile.id }, data: { displayName: counter.name, data: profile, revision: { increment: 1 }, updatedByUserId: t.userId } });
      else await tx.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_counter_profile", referenceNo: `COUNTER-${counter.id}`, displayName: counter.name, relatedEntityId: counter.id, status: "active", data: profile, createdByUserId: t.userId, updatedByUserId: t.userId } });
      await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.counter.update", entityType: "Counter", entityId: counter.id, before, after: { ...counter, profile } });
      return { counter, profile };
    });
    return ok(res, result);
  } catch (e) { return fail(res, e); }
}

async function activeVan(tx: any, businessId: string, id: string) {
  const row = await tx.industryRecord.findFirst({ where: { id, businessId, industryCode: "grocery", entityType: "grocery_van", archivedAt: null } });
  if (!row) throw new Error("Van not found");
  return row;
}

export async function createGroceryVanClosingCount(req: Request, res: Response) {
  try {
    const t = tenant(req);
    const result = await db.$transaction(async (tx: any) => {
      const van = await activeVan(tx, t.businessId, req.params.id);
      const expectedRows = await tx.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_stock", relatedEntityId: van.id, archivedAt: null } });
      const input = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!input.length) throw new Error("Physical van closing count items are required");
      const expectedMap = new Map<string, any>(expectedRows.map((x: any): [string, any] => [String(json(x.data).productId), x]));
      const productIds = [...new Set<string>([...expectedMap.keys(), ...input.map((x: any) => text(x.productId)).filter(Boolean)])];
      const products = productIds.length ? await tx.product.findMany({ where: { businessId: t.businessId, id: { in: productIds }, deleted: false } }) : [];
      const productMap = new Map<string, any>(products.map((p: any): [string, any] => [String(p.id), p]));
      const physicalMap = new Map<string, number>();
      for (const x of input) {
        const productId = text(x.productId); if (!productId || !productMap.has(productId)) throw new Error("Invalid product in physical van closing count");
        physicalMap.set(productId, round3(Math.max(0, num(x.physicalQty ?? x.qty))));
      }
      const rows: any[] = [];
      let expectedQuantity = 0, physicalQuantity = 0, varianceQuantity = 0, varianceValue = 0;
      for (const productId of productIds) {
        const p = productMap.get(productId); if (!p) continue;
        const expected = round3(num(json(expectedMap.get(productId)?.data).qty));
        const physical = physicalMap.has(productId) ? physicalMap.get(productId)! : 0;
        const variance = round3(physical - expected);
        const value = round2(variance * num(p.costPrice));
        expectedQuantity += expected; physicalQuantity += physical; varianceQuantity += variance; varianceValue += value;
        rows.push({ productId, sku: p.sku, productName: p.name, expectedQty: expected, physicalQty: physical, varianceQty: variance, unitCost: num(p.costPrice), varianceValue: value });
      }
      const total = { expectedQuantity: round3(expectedQuantity), physicalQuantity: round3(physicalQuantity), varianceQuantity: round3(varianceQuantity), varianceValue: round2(varianceValue), variancePercentage: expectedQuantity === 0 ? 0 : round2(varianceQuantity / expectedQuantity * 100) };
      const referenceNo = `VCLOSE-${Date.now()}`;
      const closing = await tx.industryRecord.create({ data: {
        businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_closing_count",
        referenceNo, displayName: `${van.displayName} physical closing`, relatedEntityId: van.id,
        status: req.body?.postAdjustment ? "posted" : "counted", startAt: new Date(), amount: total.varianceValue,
        data: { vanId: van.id, rows, total, notes: text(req.body?.notes) || null, postedAdjustment: Boolean(req.body?.postAdjustment) },
        createdByUserId: t.userId, updatedByUserId: t.userId,
      } });
      if (req.body?.postAdjustment) {
        for (const row of rows) {
          const stock = expectedMap.get(row.productId);
          const stockData = { ...json(stock?.data), vanId: van.id, productId: row.productId, sku: row.sku, productName: row.productName, qty: row.physicalQty };
          if (stock) await tx.industryRecord.update({ where: { id: stock.id }, data: { data: stockData, revision: { increment: 1 }, updatedByUserId: t.userId } });
          else await tx.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_stock", referenceNo: `${van.id}:${row.productId}`, displayName: `${row.productName} · Van`, relatedEntityId: van.id, status: "active", data: stockData, createdByUserId: t.userId, updatedByUserId: t.userId } });
        }
      }
      await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: req.body?.postAdjustment ? "grocery.van.closing.post" : "grocery.van.closing.count", entityType: "VanClosingCount", entityId: closing.id, after: { referenceNo, total } });
      return { closing, rows, total };
    });
    return ok(res, result, 201);
  } catch (e) { return fail(res, e); }
}

export async function latestGroceryVanClosingCount(req: Request, res: Response) {
  try {
    const t = tenant(req); await activeVan(db, t.businessId, req.params.id);
    const row = await db.industryRecord.findFirst({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_closing_count", relatedEntityId: req.params.id, archivedAt: null }, orderBy: { createdAt: "desc" } });
    return ok(res, row ? { ...row, data: json(row.data) } : null);
  } catch (e) { return fail(res, e); }
}

export async function groceryExpenseReportComplete(req: Request, res: Response) {
  try {
    const t = tenant(req);
    const from = asDate(req.query.from); const to = asDate(req.query.to); if (to) to.setHours(23, 59, 59, 999);
    const rows = await db.expense.findMany({ where: { businessId: t.businessId, ...(from || to ? { expenseDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }, orderBy: { expenseDate: "desc" }, take: 20000 });
    const groupBy = text(req.query.groupBy || "category");
    const grouped = new Map<string, number>();
    for (const x of rows) {
      const m = json(x.metadata); const d = new Date(x.expenseDate);
      const key = groupBy === "paymentMethod" ? text(m.paymentMethod || "Unknown")
        : groupBy === "branch" ? text(x.branchId || "Unassigned")
        : groupBy === "user" ? text(x.createdByUserId || "Unknown")
        : groupBy === "van" ? text(m.vanId || "Not Van")
        : groupBy === "date" || groupBy === "day" ? d.toISOString().slice(0, 10)
        : groupBy === "month" ? d.toISOString().slice(0, 7)
        : text(x.category || "Uncategorized");
      grouped.set(key, (grouped.get(key) || 0) + num(x.baseAmount || x.amount));
    }
    const total = round2([...grouped.values()].reduce((s, x) => s + x, 0));
    return ok(res, { groupBy, from, to, total, rows: [...grouped].map(([key, amount]) => ({ key, amount: round2(amount), percentageOfTotal: total === 0 ? 0 : round2(amount / total * 100) })).sort((a, b) => b.amount - a.amount) });
  } catch (e) { return fail(res, e); }
}

export async function groceryExpenseTemplates(req: Request, res: Response) {
  try {
    const t = tenant(req);
    const rows = await db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_expense_template", archivedAt: null }, orderBy: { displayName: "asc" }, take: 500 });
    return ok(res, rows.map((x: any) => ({ ...x, data: json(x.data) })));
  } catch (e) { return fail(res, e); }
}

export async function createGroceryExpenseTemplate(req: Request, res: Response) {
  try {
    const t = tenant(req); const name = text(req.body?.name); if (!name) throw new Error("Template name is required");
    const frequency = text(req.body?.frequency || "monthly").toLowerCase(); if (!["weekly", "monthly", "quarterly", "yearly"].includes(frequency)) throw new Error("Invalid recurring frequency");
    const amount = round2(Math.max(0, num(req.body?.amount)));
    const data = { category: text(req.body?.category || "General Expense"), amount, paymentMethod: text(req.body?.paymentMethod || "cash"), expenseAccountId: text(req.body?.expenseAccountId) || null, paymentAccountId: text(req.body?.paymentAccountId) || null, branchId: text(req.body?.branchId) || null, vanId: text(req.body?.vanId) || null, supplierPayee: text(req.body?.supplierPayee) || null, frequency, nextDate: asDate(req.body?.nextDate)?.toISOString() || null, notes: text(req.body?.notes) || null };
    const row = await db.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_expense_template", referenceNo: `EXPTPL-${Date.now()}`, displayName: name, status: "active", amount, startAt: asDate(req.body?.nextDate), data, createdByUserId: t.userId, updatedByUserId: t.userId } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.expense_template.create", entityType: "ExpenseTemplate", entityId: row.id, after: data });
    return ok(res, row, 201);
  } catch (e) { return fail(res, e); }
}

export async function archiveGroceryExpenseTemplate(req: Request, res: Response) {
  try {
    const t = tenant(req); const row = await db.industryRecord.findFirst({ where: { id: req.params.id, businessId: t.businessId, industryCode: "grocery", entityType: "grocery_expense_template", archivedAt: null } }); if (!row) throw new Error("Expense template not found");
    const updated = await db.industryRecord.update({ where: { id: row.id }, data: { archivedAt: new Date(), status: "archived", updatedByUserId: t.userId } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.expense_template.archive", entityType: "ExpenseTemplate", entityId: row.id, before: row, after: updated });
    return ok(res, updated);
  } catch (e) { return fail(res, e); }
}
