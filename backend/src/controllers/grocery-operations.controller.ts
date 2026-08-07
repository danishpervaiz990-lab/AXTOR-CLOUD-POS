import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";
import {
  ensureStandardGroceryAccounts,
  postBalancedGroceryJournal,
  postGroceryCustomerPaymentAccounting,
  postGroceryExpenseAccounting,
  postGrocerySaleAccounting,
  postGrocerySupplierPaymentAccounting,
} from "../services/grocery-accounting.service.js";

const db: any = prisma;
const DAY = 86_400_000;
function text(v: unknown) { return String(v ?? "").trim(); }
function num(v: unknown, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function round2(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function round3(v: number) { return Math.round((v + Number.EPSILON) * 1000) / 1000; }
function json(v: unknown): Record<string, any> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {}; }
function tenant(req: Request) { const businessId = req.tenant?.businessId; const userId = req.tenant?.userId; if (!businessId || !userId) throw new Error("Authenticated Grocery tenant is required"); return { businessId, userId }; }
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok: true, data }); }
function fail(res: Response, e: any, status = 400) { return res.status(status).json({ ok: false, error: { message: e?.message || String(e || "Request failed") } }); }
function bool(v: unknown, f = false) { if (v === undefined || v === null || v === "") return f; if (typeof v === "boolean") return v; return ["1", "true", "yes", "on"].includes(String(v).toLowerCase()); }
function asDate(v: unknown) { const d = new Date(String(v || "")); return Number.isNaN(d.getTime()) ? null : d; }

async function product(tx: any, businessId: string, id: string) {
  const row = await tx.product.findFirst({ where: { id, businessId, deleted: false } });
  if (!row) throw new Error("Product not found");
  return row;
}
async function warehouse(tx: any, businessId: string, id: string) {
  const row = await tx.warehouse.findFirst({ where: { id, businessId, active: true } });
  if (!row) throw new Error("Warehouse not found or inactive");
  return row;
}
async function industryRecord(businessId: string, entityType: string, id: string) {
  return db.industryRecord.findFirst({ where: { id, businessId, industryCode: "grocery", entityType, archivedAt: null } });
}
function groceryFields(p: any) {
  const f = json(p?.customFields); const g = json(f.grocery);
  const barcodes = Array.isArray(g.barcodes) ? g.barcodes.map(text).filter(Boolean) : [];
  const uoms = Array.isArray(g.uoms) ? g.uoms.map((x: any) => ({ unit: text(x.unit).toUpperCase(), multiplier: Math.max(0.0001, num(x.multiplier, 1)) })).filter((x: any) => x.unit) : [];
  return {
    barcodes, plu: text(g.plu) || null, weightedBarcode: bool(g.weightedBarcode), priceEmbeddedBarcode: bool(g.priceEmbeddedBarcode),
    baseUnit: text(g.baseUnit || p?.unit || "PCS").toUpperCase(), uoms,
    retailPrice: num(g.retailPrice, num(p?.price)), wholesalePrice: num(g.wholesalePrice), memberPrice: num(g.memberPrice), promotionalPrice: num(g.promotionalPrice),
    minimumSellingPrice: num(g.minimumSellingPrice), maxStock: num(g.maxStock), reorderLevel: num(g.reorderLevel, num(p?.minStock)), reorderQuantity: num(g.reorderQuantity),
    margin: num(g.margin), markup: num(g.markup), expiryTracking: bool(g.expiryTracking || f.expiryTracking), batchTracking: bool(g.batchTracking || f.batchTracking),
  };
}

export async function groceryProductProfile(req: Request, res: Response) {
  try { const t = tenant(req); const p = await product(db, t.businessId, req.params.id); return ok(res, { product: p, grocery: groceryFields(p) }); } catch (e) { return fail(res, e); }
}
export async function saveGroceryProductProfile(req: Request, res: Response) {
  try {
    const t = tenant(req); const before = await product(db, t.businessId, req.params.id); const old = groceryFields(before); const input = req.body || {};
    const barcodes = Array.isArray(input.barcodes) ? [...new Set(input.barcodes.map(text).filter(Boolean))] : old.barcodes;
    const uoms = Array.isArray(input.uoms) ? input.uoms.map((x: any) => ({ unit: text(x.unit).toUpperCase(), multiplier: round3(Math.max(0.0001, num(x.multiplier, 1))) })).filter((x: any) => x.unit) : old.uoms;
    const baseUnit = text(input.baseUnit || old.baseUnit || before.unit || "PCS").toUpperCase();
    if (!uoms.some((x: any) => x.unit === baseUnit)) uoms.unshift({ unit: baseUnit, multiplier: 1 });
    const duplicatePrimary = barcodes.length ? await db.product.findFirst({ where: { businessId: t.businessId, id: { not: before.id }, deleted: false, barcode: { in: barcodes } }, select: { id: true, name: true, barcode: true } }) : null;
    if (duplicatePrimary) throw new Error(`Barcode ${duplicatePrimary.barcode} already belongs to ${duplicatePrimary.name}`);
    const profile = {
      ...old,
      barcodes, uoms, baseUnit,
      plu: input.plu !== undefined ? text(input.plu) || null : old.plu,
      weightedBarcode: input.weightedBarcode !== undefined ? bool(input.weightedBarcode) : old.weightedBarcode,
      priceEmbeddedBarcode: input.priceEmbeddedBarcode !== undefined ? bool(input.priceEmbeddedBarcode) : old.priceEmbeddedBarcode,
      retailPrice: input.retailPrice !== undefined ? Math.max(0, num(input.retailPrice)) : old.retailPrice,
      wholesalePrice: input.wholesalePrice !== undefined ? Math.max(0, num(input.wholesalePrice)) : old.wholesalePrice,
      memberPrice: input.memberPrice !== undefined ? Math.max(0, num(input.memberPrice)) : old.memberPrice,
      promotionalPrice: input.promotionalPrice !== undefined ? Math.max(0, num(input.promotionalPrice)) : old.promotionalPrice,
      minimumSellingPrice: input.minimumSellingPrice !== undefined ? Math.max(0, num(input.minimumSellingPrice)) : old.minimumSellingPrice,
      maxStock: input.maxStock !== undefined ? Math.max(0, num(input.maxStock)) : old.maxStock,
      reorderLevel: input.reorderLevel !== undefined ? Math.max(0, num(input.reorderLevel)) : old.reorderLevel,
      reorderQuantity: input.reorderQuantity !== undefined ? Math.max(0, num(input.reorderQuantity)) : old.reorderQuantity,
      margin: input.margin !== undefined ? num(input.margin) : old.margin,
      markup: input.markup !== undefined ? num(input.markup) : old.markup,
      expiryTracking: input.expiryTracking !== undefined ? bool(input.expiryTracking) : old.expiryTracking,
      batchTracking: input.batchTracking !== undefined ? bool(input.batchTracking) : old.batchTracking,
    };
    const customFields = { ...json(before.customFields), grocery: profile, expiryTracking: profile.expiryTracking, batchTracking: profile.batchTracking };
    const updated = await db.product.update({ where: { id: before.id }, data: { unit: baseUnit, price: profile.retailPrice, minStock: profile.reorderLevel, customFields } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.product.profile.update", entityType: "Product", entityId: before.id, before: old, after: profile });
    return ok(res, { product: updated, grocery: profile });
  } catch (e) { return fail(res, e); }
}
export async function groceryProductLookup(req: Request, res: Response) {
  try {
    const t = tenant(req); const q = text(req.query.q || req.query.code).toLowerCase(); if (!q) throw new Error("Lookup code is required");
    let p = await db.product.findFirst({ where: { businessId: t.businessId, deleted: false, active: true, OR: [{ sku: { equals: q, mode: "insensitive" } }, { barcode: { equals: q, mode: "insensitive" } }, { itemCode: { equals: q, mode: "insensitive" } }, { productCode: { equals: q, mode: "insensitive" } }] } });
    if (!p) {
      const products = await db.product.findMany({ where: { businessId: t.businessId, deleted: false, active: true }, take: 10000 });
      p = products.find((x: any) => { const g = groceryFields(x); return String(g.plu || "").toLowerCase() === q || g.barcodes.some((b: string) => b.toLowerCase() === q); }) || null;
    }
    if (!p) return fail(res, new Error("Product not found"), 404);
    return ok(res, { product: p, grocery: groceryFields(p) });
  } catch (e) { return fail(res, e); }
}

async function counterProfiles(businessId: string) {
  const rows = await db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_counter_profile", archivedAt: null } });
  return new Map(rows.map((x: any) => [String(x.relatedEntityId), x]));
}
export async function groceryCounters(req: Request, res: Response) {
  try {
    const t = tenant(req); const [rows, profiles] = await Promise.all([db.counter.findMany({ where: { businessId: t.businessId }, include: { branch: true }, orderBy: { name: "asc" } }), counterProfiles(t.businessId)]);
    return ok(res, rows.map((c: any) => ({ ...c, profile: json(profiles.get(String(c.id))?.data) })));
  } catch (e) { return fail(res, e); }
}
export async function saveGroceryCounterProfile(req: Request, res: Response) {
  try {
    const t = tenant(req); const counter = await db.counter.findFirst({ where: { id: req.params.id, businessId: t.businessId } }); if (!counter) throw new Error("Counter not found");
    const current = await db.industryRecord.findFirst({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_counter_profile", relatedEntityId: counter.id, archivedAt: null } });
    const data = { ...json(current?.data), defaultWarehouseId: text(req.body?.defaultWarehouseId) || null, terminalDevice: text(req.body?.terminalDevice) || null, printer: text(req.body?.printer) || null, cashDrawer: text(req.body?.cashDrawer) || null };
    if (data.defaultWarehouseId) await warehouse(db, t.businessId, data.defaultWarehouseId);
    const row = current ? await db.industryRecord.update({ where: { id: current.id }, data: { data, revision: { increment: 1 }, updatedByUserId: t.userId } }) : await db.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_counter_profile", referenceNo: `COUNTER-${counter.id}`, displayName: counter.name, relatedEntityId: counter.id, status: "active", data, createdByUserId: t.userId, updatedByUserId: t.userId } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.counter.profile.update", entityType: "Counter", entityId: counter.id, after: data });
    return ok(res, row);
  } catch (e) { return fail(res, e); }
}
export async function groceryCounterCashMovement(req: Request, res: Response) {
  try {
    const t = tenant(req); const shiftId = text(req.params.shiftId); const shift = await db.shift.findFirst({ where: { id: shiftId, businessId: t.businessId, status: "OPEN" } }); if (!shift) throw new Error("Open shift not found");
    const type = text(req.body?.type).toLowerCase(); if (!["cash_in", "cash_out"].includes(type)) throw new Error("type must be cash_in or cash_out"); const amount = round2(num(req.body?.amount)); if (amount <= 0) throw new Error("Amount must be greater than zero");
    const row = await db.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_counter_cash", referenceNo: `CASH-${shift.id}-${Date.now()}`, displayName: `${type} ${shift.counterName || "Counter"}`, relatedEntityId: shift.id, amount, status: "posted", startAt: new Date(), data: { type, amount, reason: text(req.body?.reason) || null, counterId: shift.counterId, branchId: shift.branchId }, createdByUserId: t.userId } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: `grocery.counter.${type}`, entityType: "Shift", entityId: shift.id, after: { amount, reason: text(req.body?.reason) || null } });
    return ok(res, row, 201);
  } catch (e) { return fail(res, e); }
}
export async function groceryCounterSummary(req: Request, res: Response) {
  try {
    const t = tenant(req); const shift = await db.shift.findFirst({ where: { id: req.params.shiftId, businessId: t.businessId } }); if (!shift) throw new Error("Shift not found");
    const [sales, cashMoves] = await Promise.all([
      db.salesDocument.findMany({ where: { businessId: t.businessId, shiftId: shift.id, documentType: "INVOICE", status: { notIn: ["CANCELLED", "VOID"] } } }),
      db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_counter_cash", relatedEntityId: shift.id, archivedAt: null } }),
    ]);
    const gross = round2(sales.reduce((s: number, x: any) => s + num(x.total), 0)); const paid = round2(sales.reduce((s: number, x: any) => s + num(x.paid), 0));
    const cashIn = round2(cashMoves.filter((x: any) => json(x.data).type === "cash_in").reduce((s: number, x: any) => s + num(x.amount), 0));
    const cashOut = round2(cashMoves.filter((x: any) => json(x.data).type === "cash_out").reduce((s: number, x: any) => s + num(x.amount), 0));
    const expectedCash = round2(num(shift.openingCash) + cashIn - cashOut + sales.filter((x: any) => String(x.paymentMethod).toLowerCase() === "cash").reduce((s: number, x: any) => s + num(x.paid), 0));
    return ok(res, { shift, salesCount: sales.length, grossSales: gross, paid, openingCash: num(shift.openingCash), cashIn, cashOut, expectedCash, actualCash: shift.closingCash == null ? null : num(shift.closingCash), difference: shift.closingCash == null ? null : round2(num(shift.closingCash) - expectedCash), reportType: text(req.query.report || "X").toUpperCase() });
  } catch (e) { return fail(res, e); }
}

async function vanRow(businessId: string, id: string) { const v = await industryRecord(businessId, "grocery_van", id); if (!v) throw new Error("Van not found"); return v; }
export async function groceryVans(req: Request, res: Response) {
  try { const t = tenant(req); return ok(res, await db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van", archivedAt: null }, orderBy: { displayName: "asc" } })); } catch (e) { return fail(res, e); }
}
export async function createGroceryVan(req: Request, res: Response) {
  try {
    const t = tenant(req); const code = text(req.body?.code || req.body?.vanCode); const name = text(req.body?.name || code); if (!code || !name) throw new Error("Van code and name are required"); const sourceWarehouseId = text(req.body?.sourceWarehouseId); if (sourceWarehouseId) await warehouse(db, t.businessId, sourceWarehouseId);
    const row = await db.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van", referenceNo: code, displayName: name, status: bool(req.body?.active, true) ? "active" : "inactive", data: { code, plateReference: text(req.body?.plateReference) || null, salespersonId: text(req.body?.salespersonId) || null, driver: text(req.body?.driver) || null, sourceWarehouseId }, createdByUserId: t.userId, updatedByUserId: t.userId } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.van.create", entityType: "Van", entityId: row.id, after: row.data }); return ok(res, row, 201);
  } catch (e) { return fail(res, e); }
}
export async function updateGroceryVan(req: Request, res: Response) {
  try { const t = tenant(req); const before = await vanRow(t.businessId, req.params.id); const data = { ...json(before.data), ...(req.body?.plateReference !== undefined ? { plateReference: text(req.body.plateReference) || null } : {}), ...(req.body?.salespersonId !== undefined ? { salespersonId: text(req.body.salespersonId) || null } : {}), ...(req.body?.driver !== undefined ? { driver: text(req.body.driver) || null } : {}), ...(req.body?.sourceWarehouseId !== undefined ? { sourceWarehouseId: text(req.body.sourceWarehouseId) || null } : {}) }; if (data.sourceWarehouseId) await warehouse(db, t.businessId, data.sourceWarehouseId); const row = await db.industryRecord.update({ where: { id: before.id }, data: { displayName: text(req.body?.name) || before.displayName, status: req.body?.active === undefined ? before.status : bool(req.body.active) ? "active" : "inactive", data, revision: { increment: 1 }, updatedByUserId: t.userId } }); return ok(res, row); } catch (e) { return fail(res, e); }
}
async function vanStock(tx: any, businessId: string, vanId: string, productId: string) {
  const referenceNo = `${vanId}:${productId}`;
  const row = await tx.industryRecord.findFirst({ where: { businessId, industryCode: "grocery", entityType: "grocery_van_stock", referenceNo, archivedAt: null } });
  return { row, qty: num(json(row?.data).qty), referenceNo };
}
async function changeVanStock(tx: any, businessId: string, userId: string, vanId: string, p: any, delta: number) {
  const s = await vanStock(tx, businessId, vanId, p.id); const next = round3(s.qty + delta); if (next < -0.0001) throw new Error(`Insufficient van stock for ${p.name}`); const data = { ...json(s.row?.data), vanId, productId: p.id, sku: p.sku, productName: p.name, qty: Math.max(0, next) };
  if (s.row) return tx.industryRecord.update({ where: { id: s.row.id }, data: { amount: 0, data, revision: { increment: 1 }, updatedByUserId: userId } });
  return tx.industryRecord.create({ data: { businessId, industryCode: "grocery", entityType: "grocery_van_stock", referenceNo: s.referenceNo, displayName: `${p.name} · Van`, relatedEntityId: vanId, status: "active", data, createdByUserId: userId, updatedByUserId: userId } });
}
export async function groceryVanStock(req: Request, res: Response) {
  try { const t = tenant(req); await vanRow(t.businessId, req.params.id); const rows = await db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_van_stock", relatedEntityId: req.params.id, archivedAt: null } }); return ok(res, rows.map((x: any) => ({ id: x.id, ...json(x.data) }))); } catch (e) { return fail(res, e); }
}

async function inventoryQty(tx: any, businessId: string, productId: string, warehouseId: string) { const r = await tx.inventoryStock.findUnique({ where: { businessId_productId_warehouseId: { businessId, productId, warehouseId } } }); return num(r?.qtyOnHand); }
async function changeWarehouseStock(tx: any, businessId: string, p: any, warehouseId: string, delta: number) {
  const before = await inventoryQty(tx, businessId, p.id, warehouseId); const after = round3(before + delta); if (after < -0.0001) throw new Error(`Insufficient warehouse stock for ${p.name}`);
  await tx.inventoryStock.upsert({ where: { businessId_productId_warehouseId: { businessId, productId: p.id, warehouseId } }, create: { businessId, productId: p.id, warehouseId, qtyOnHand: Math.max(0, after) }, update: { qtyOnHand: Math.max(0, after) } });
  await tx.product.update({ where: { id: p.id }, data: { currentStock: { increment: delta } } }); return { before, after: Math.max(0, after) };
}
export async function createGroceryTransfer(req: Request, res: Response) {
  try {
    const t = tenant(req); const sourceType = text(req.body?.sourceType || "warehouse").toLowerCase(); const destinationType = text(req.body?.destinationType || "warehouse").toLowerCase(); const sourceId = text(req.body?.sourceId || req.body?.fromWarehouseId); const destinationId = text(req.body?.destinationId || req.body?.toWarehouseId); if (!["warehouse", "van"].includes(sourceType) || !["warehouse", "van"].includes(destinationType) || !sourceId || !destinationId) throw new Error("Valid source and destination are required"); if (sourceType === destinationType && sourceId === destinationId) throw new Error("Source and destination must be different"); if (sourceType === "warehouse") await warehouse(db, t.businessId, sourceId); else await vanRow(t.businessId, sourceId); if (destinationType === "warehouse") await warehouse(db, t.businessId, destinationId); else await vanRow(t.businessId, destinationId);
    const lines = Array.isArray(req.body?.lines) ? req.body.lines.map((x: any) => ({ productId: text(x.productId), qty: round3(num(x.qty || x.quantity)), receivedQty: 0 })).filter((x: any) => x.productId && x.qty > 0) : []; if (!lines.length) throw new Error("Transfer lines are required");
    const referenceNo = text(req.body?.referenceNo) || `GTR-${Date.now()}`; const row = await db.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_stock_transfer", referenceNo, displayName: `${sourceType} → ${destinationType}`, status: "DRAFT", data: { sourceType, sourceId, destinationType, destinationId, lines, dispatched: false, notes: text(req.body?.notes) || null }, createdByUserId: t.userId, updatedByUserId: t.userId } }); return ok(res, row, 201);
  } catch (e) { return fail(res, e); }
}
export async function groceryTransfers(req: Request, res: Response) {
  try { const t = tenant(req); return ok(res, await db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_stock_transfer", archivedAt: null }, orderBy: { createdAt: "desc" }, take: 500 })); } catch (e) { return fail(res, e); }
}
export async function transitionGroceryTransfer(req: Request, res: Response) {
  try {
    const t = tenant(req); const target = text(req.body?.status).toUpperCase(); if (!["APPROVED", "IN_TRANSIT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"].includes(target)) throw new Error("Invalid transfer status");
    const result = await db.$transaction(async (tx: any) => {
      const row = await tx.industryRecord.findFirst({ where: { id: req.params.id, businessId: t.businessId, industryCode: "grocery", entityType: "grocery_stock_transfer", archivedAt: null } }); if (!row) throw new Error("Transfer not found"); const d = json(row.data); const lines = Array.isArray(d.lines) ? d.lines.map((x: any) => ({ ...x })) : [];
      if (target === "IN_TRANSIT" && !d.dispatched) {
        for (const line of lines) { const p = await product(tx, t.businessId, line.productId); const qty = round3(num(line.qty)); if (d.sourceType === "warehouse") { const m = await changeWarehouseStock(tx, t.businessId, p, d.sourceId, -qty); await tx.stockMovement.create({ data: { businessId: t.businessId, movementNo: `${row.referenceNo}-OUT-${p.id}-${Date.now()}`, productId: p.id, sku: p.sku, productName: p.name, warehouseId: d.sourceId, direction: "TRANSFER", movementType: "TRANSFER_DISPATCH", referenceNo: row.referenceNo, qty, beforeQty: m.before, afterQty: m.after, source: "grocery_transfer", metadata: { transferId: row.id, destinationType: d.destinationType, destinationId: d.destinationId } } }); } else await changeVanStock(tx, t.businessId, t.userId, d.sourceId, p, -qty); }
        d.dispatched = true; d.dispatchedAt = new Date().toISOString();
      }
      if (["PARTIALLY_RECEIVED", "RECEIVED"].includes(target)) {
        if (!d.dispatched) throw new Error("Transfer must be dispatched before receiving"); const receivedInput = Array.isArray(req.body?.lines) ? req.body.lines : [];
        for (const line of lines) { const input = receivedInput.find((x: any) => text(x.productId) === text(line.productId)); const remaining = round3(num(line.qty) - num(line.receivedQty)); const receiveQty = target === "RECEIVED" && !input ? remaining : round3(Math.min(remaining, Math.max(0, num(input?.qtyReceived ?? input?.qty)))); if (receiveQty <= 0) continue; const p = await product(tx, t.businessId, line.productId); if (d.destinationType === "warehouse") { const m = await changeWarehouseStock(tx, t.businessId, p, d.destinationId, receiveQty); await tx.stockMovement.create({ data: { businessId: t.businessId, movementNo: `${row.referenceNo}-IN-${p.id}-${Date.now()}`, productId: p.id, sku: p.sku, productName: p.name, warehouseId: d.destinationId, direction: "TRANSFER", movementType: "TRANSFER_RECEIPT", referenceNo: row.referenceNo, qty: receiveQty, beforeQty: m.before, afterQty: m.after, source: "grocery_transfer", metadata: { transferId: row.id, sourceType: d.sourceType, sourceId: d.sourceId } } }); } else await changeVanStock(tx, t.businessId, t.userId, d.destinationId, p, receiveQty); line.receivedQty = round3(num(line.receivedQty) + receiveQty); }
        d.lines = lines; const complete = lines.every((x: any) => num(x.receivedQty) + 0.0001 >= num(x.qty)); if (target === "RECEIVED" && !complete) throw new Error("Cannot mark Received while quantities remain outstanding");
      }
      const status = ["PARTIALLY_RECEIVED", "RECEIVED"].includes(target) ? (lines.every((x: any) => num(x.receivedQty) + 0.0001 >= num(x.qty)) ? "RECEIVED" : "PARTIALLY_RECEIVED") : target;
      const updated = await tx.industryRecord.update({ where: { id: row.id }, data: { status, data: d, revision: { increment: 1 }, updatedByUserId: t.userId } }); await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.transfer.status", entityType: "StockTransfer", entityId: row.id, before: { status: row.status }, after: { status } }); return updated;
    }); return ok(res, result);
  } catch (e) { return fail(res, e); }
}

export async function createGroceryStockCount(req: Request, res: Response) {
  try {
    const t = tenant(req); const w = await warehouse(db, t.businessId, text(req.body?.warehouseId)); const countType = text(req.body?.countType || "full").toLowerCase(); if (!["full", "cycle"].includes(countType)) throw new Error("countType must be full or cycle");
    const productIds = Array.isArray(req.body?.productIds) ? req.body.productIds.map(text).filter(Boolean) : [];
    const products = await db.product.findMany({ where: { businessId: t.businessId, deleted: false, active: true, ...(countType === "cycle" && productIds.length ? { id: { in: productIds } } : {}) }, orderBy: { name: "asc" } });
    const stocks = await db.inventoryStock.findMany({ where: { businessId: t.businessId, warehouseId: w.id, productId: { in: products.map((p: any) => p.id) } } }); const stockMap = new Map(stocks.map((x: any) => [String(x.productId), num(x.qtyOnHand)]));
    const count = await db.stockCount.create({ data: { businessId: t.businessId, warehouseId: w.id, countNo: text(req.body?.countNo) || `SC-${Date.now()}`, status: "draft", countedByUserId: t.userId, notes: JSON.stringify({ countType, note: text(req.body?.notes) || null }), items: { create: products.map((p: any) => ({ businessId: t.businessId, productId: p.id, sku: p.sku, productName: p.name, systemQty: stockMap.get(String(p.id)) || 0, countedQty: stockMap.get(String(p.id)) || 0, difference: 0 })) } }, include: { items: true } }); return ok(res, count, 201);
  } catch (e) { return fail(res, e); }
}
export async function updateGroceryStockCount(req: Request, res: Response) {
  try {
    const t = tenant(req); const count = await db.stockCount.findFirst({ where: { id: req.params.id, businessId: t.businessId }, include: { items: true } }); if (!count || count.status !== "draft") throw new Error("Draft stock count not found"); const entries = Array.isArray(req.body?.items) ? req.body.items : [];
    await db.$transaction(async (tx: any) => { for (const item of count.items) { const x = entries.find((e: any) => text(e.productId) === text(item.productId) || text(e.sku).toLowerCase() === text(item.sku).toLowerCase()); if (!x) continue; const countedQty = round3(num(x.countedQty)); await tx.stockCountItem.update({ where: { id: item.id }, data: { countedQty, difference: round3(countedQty - num(item.systemQty)) } }); } });
    return ok(res, await db.stockCount.findUnique({ where: { id: count.id }, include: { items: true } }));
  } catch (e) { return fail(res, e); }
}
export async function approveGroceryStockCount(req: Request, res: Response) {
  try {
    const t = tenant(req); const result = await db.$transaction(async (tx: any) => { const count = await tx.stockCount.findFirst({ where: { id: req.params.id, businessId: t.businessId }, include: { items: true } }); if (!count || count.status !== "draft") throw new Error("Draft stock count not found"); let varianceValue = 0; let systemValue = 0; for (const item of count.items) { const p = await product(tx, t.businessId, item.productId); const diff = round3(num(item.countedQty) - num(item.systemQty)); varianceValue += diff * num(p.costPrice); systemValue += num(item.systemQty) * num(p.costPrice); if (Math.abs(diff) > 0.0001) { const m = await changeWarehouseStock(tx, t.businessId, p, count.warehouseId, diff); await tx.stockMovement.create({ data: { businessId: t.businessId, movementNo: `${count.countNo}-${p.id}-${Date.now()}`, productId: p.id, sku: p.sku, productName: p.name, warehouseId: count.warehouseId, direction: "ADJUSTMENT", movementType: "STOCK_COUNT", referenceNo: count.countNo, qty: Math.abs(diff), beforeQty: m.before, afterQty: m.after, source: "grocery_stock_count", metadata: { stockCountId: count.id, varianceValue: round2(diff * num(p.costPrice)) } } }); } } const updated = await tx.stockCount.update({ where: { id: count.id }, data: { status: "approved", approvedByUserId: t.userId, approvedAt: new Date() }, include: { items: true } }); await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.stock_count.approve", entityType: "StockCount", entityId: count.id, after: { varianceValue: round2(varianceValue) } }); return { ...updated, varianceValue: round2(varianceValue), variancePercentage: systemValue === 0 ? 0 : round2(varianceValue / systemValue * 100) }; }); return ok(res, result);
  } catch (e) { return fail(res, e); }
}

export async function groceryReorderSuggestions(req: Request, res: Response) {
  try {
    const t = tenant(req); const warehouseId = text(req.query.warehouseId); const since = new Date(Date.now() - Math.max(7, num(req.query.days, 30)) * DAY);
    const [products, stocks, sales, pos] = await Promise.all([
      db.product.findMany({ where: { businessId: t.businessId, deleted: false, active: true }, orderBy: { name: "asc" }, take: 10000 }),
      db.inventoryStock.findMany({ where: { businessId: t.businessId, ...(warehouseId ? { warehouseId } : {}) } }),
      db.salesDocument.findMany({ where: { businessId: t.businessId, documentType: "INVOICE", issuedAt: { gte: since }, status: { notIn: ["CANCELLED", "VOID"] } }, include: { items: true }, take: 5000 }),
      db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_purchase_order", status: { in: ["DRAFT", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"] }, archivedAt: null } }),
    ]);
    const stockMap = new Map<string, number>(); for (const s of stocks) stockMap.set(String(s.productId), (stockMap.get(String(s.productId)) || 0) + num(s.qtyOnHand));
    const soldMap = new Map<string, number>(); for (const sale of sales) for (const i of sale.items || []) soldMap.set(String(i.productId), (soldMap.get(String(i.productId)) || 0) + num(i.qty));
    const onOrder = new Map<string, number>(); for (const po of pos) for (const i of (json(po.data).lines || [])) onOrder.set(String(i.productId), (onOrder.get(String(i.productId)) || 0) + Math.max(0, num(i.quantity || i.qty) - num(i.receivedQty)));
    const rows = products.map((p: any) => { const g = groceryFields(p); const current = stockMap.get(String(p.id)) || 0; const incoming = onOrder.get(String(p.id)) || 0; const recentSales = soldMap.get(String(p.id)) || 0; const target = g.maxStock > 0 ? g.maxStock : Math.max(g.reorderLevel * 2, current); const suggested = current + incoming <= g.reorderLevel ? Math.max(g.reorderQuantity || 0, Math.ceil(target - current - incoming), 0) : 0; return { productId: p.id, sku: p.sku, productName: p.name, currentStock: round3(current), onOrder: round3(incoming), recentSales: round3(recentSales), reorderLevel: g.reorderLevel, maxStock: g.maxStock, suggestedQty: round3(suggested), lowStock: current <= g.reorderLevel, outOfStock: current <= 0, excessStock: g.maxStock > 0 && current > g.maxStock, deadStock: recentSales <= 0 && current > 0 }; });
    return ok(res, rows.filter((x: any) => bool(req.query.all) || x.suggestedQty > 0 || x.outOfStock || x.excessStock || x.deadStock));
  } catch (e) { return fail(res, e); }
}

export async function groceryChartOfAccounts(req: Request, res: Response) {
  try { const t = tenant(req); const rows = await db.$transaction(async (tx: any) => { await ensureStandardGroceryAccounts(tx, t.businessId); return tx.account.findMany({ where: { businessId: t.businessId, active: true }, orderBy: [{ type: "asc" }, { accountNumber: "asc" }, { name: "asc" }] }); }); return ok(res, rows); } catch (e) { return fail(res, e); }
}
export async function bootstrapGroceryAccounting(req: Request, res: Response) {
  try { const t = tenant(req); const rows = await db.$transaction((tx: any) => ensureStandardGroceryAccounts(tx, t.businessId)); await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.accounting.bootstrap", entityType: "Account", after: { count: rows.length } }); return ok(res, rows); } catch (e) { return fail(res, e); }
}
function journalTotals(lines: any[]) { const debit = round2(lines.reduce((s, x) => s + Math.max(0, num(x.debit)), 0)); const credit = round2(lines.reduce((s, x) => s + Math.max(0, num(x.credit)), 0)); return { debit, credit, balanced: Math.abs(debit - credit) <= 0.001 }; }
export async function groceryJournals(req: Request, res: Response) {
  try { const t = tenant(req); return ok(res, await db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_journal_entry", archivedAt: null }, orderBy: { createdAt: "desc" }, take: 500 })); } catch (e) { return fail(res, e); }
}
export async function createGroceryJournal(req: Request, res: Response) {
  try {
    const t = tenant(req); const lines = Array.isArray(req.body?.lines) ? req.body.lines : []; const totals = journalTotals(lines); if (!lines.length || !totals.balanced) throw new Error(`Journal must balance. Debit ${totals.debit.toFixed(2)} / Credit ${totals.credit.toFixed(2)}`); const referenceNo = text(req.body?.journalNo) || `JRN-${Date.now()}`;
    const row = await db.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_journal_entry", referenceNo, displayName: text(req.body?.description) || referenceNo, status: "DRAFT", startAt: asDate(req.body?.date) || new Date(), data: { reference: text(req.body?.reference) || null, branchId: text(req.body?.branchId) || null, warehouseId: text(req.body?.warehouseId) || null, description: text(req.body?.description) || null, lines, totals, createdBy: t.userId }, createdByUserId: t.userId, updatedByUserId: t.userId } }); return ok(res, row, 201);
  } catch (e) { return fail(res, e); }
}
export async function transitionGroceryJournal(req: Request, res: Response) {
  try {
    const t = tenant(req); const target = text(req.body?.status).toUpperCase(); if (!["APPROVED", "POSTED", "REVERSED"].includes(target)) throw new Error("Invalid journal status");
    const result = await db.$transaction(async (tx: any) => { const row = await tx.industryRecord.findFirst({ where: { id: req.params.id, businessId: t.businessId, industryCode: "grocery", entityType: "grocery_journal_entry", archivedAt: null } }); if (!row) throw new Error("Journal not found"); const d = json(row.data); const lines = Array.isArray(d.lines) ? d.lines : []; const totals = journalTotals(lines); if (!totals.balanced) throw new Error("Unbalanced journal cannot be posted"); if (target === "POSTED") { if (!["DRAFT", "APPROVED"].includes(String(row.status).toUpperCase())) throw new Error("Only Draft/Approved journals can be posted"); await postBalancedGroceryJournal(tx, { businessId: t.businessId, userId: t.userId, referenceNo: row.referenceNo || row.id, description: d.description || row.displayName, transactionDate: row.startAt || new Date(), sourceType: "grocery_manual_journal", sourceId: row.id, lines }); d.postedAt = new Date().toISOString(); d.approvedBy = d.approvedBy || t.userId; d.postedBy = t.userId; }
      if (target === "APPROVED") { if (String(row.status).toUpperCase() !== "DRAFT") throw new Error("Only Draft journals can be approved"); d.approvedBy = t.userId; d.approvedAt = new Date().toISOString(); }
      if (target === "REVERSED") { if (String(row.status).toUpperCase() !== "POSTED") throw new Error("Only Posted journals can be reversed"); const reverse = lines.map((x: any) => ({ ...x, debit: num(x.credit), credit: num(x.debit), description: `Reversal: ${text(x.description || d.description)}` })); await postBalancedGroceryJournal(tx, { businessId: t.businessId, userId: t.userId, referenceNo: `${row.referenceNo || row.id}-REV`, description: `Reversal of ${row.referenceNo || row.id}`, transactionDate: new Date(), sourceType: "grocery_manual_journal_reversal", sourceId: row.id, lines: reverse }); d.reversedAt = new Date().toISOString(); d.reversedBy = t.userId; }
      const updated = await tx.industryRecord.update({ where: { id: row.id }, data: { status: target, data: d, revision: { increment: 1 }, updatedByUserId: t.userId } }); await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: `grocery.journal.${target.toLowerCase()}`, entityType: "Journal", entityId: row.id, before: { status: row.status }, after: { status: target, totals } }); return updated; }); return ok(res, result);
  } catch (e) { return fail(res, e); }
}

export async function groceryExpenses(req: Request, res: Response) {
  try {
    const t = tenant(req); const from = asDate(req.query.from) || new Date(Date.now() - 365 * DAY); const to = asDate(req.query.to) || new Date(); to.setHours(23, 59, 59, 999); const rows = await db.expense.findMany({ where: { businessId: t.businessId, expenseDate: { gte: from, lte: to } }, orderBy: { expenseDate: "desc" }, take: 5000 }); const total = round2(rows.reduce((s: number, x: any) => s + num(x.baseAmount || x.amount), 0)); return ok(res, { total, rows: rows.map((x: any) => ({ ...x, amount: num(x.amount), baseAmount: num(x.baseAmount), percentageOfTotal: total === 0 ? 0 : round2(num(x.baseAmount || x.amount) / total * 100), paymentMethod: json(x.metadata).paymentMethod || null, counterId: json(x.metadata).counterId || null, vanId: json(x.metadata).vanId || null })) });
  } catch (e) { return fail(res, e); }
}
export async function createGroceryExpense(req: Request, res: Response) {
  try {
    const t = tenant(req); const amount = round2(num(req.body?.amount)); if (amount <= 0) throw new Error("Expense amount must be greater than zero"); const expenseDate = asDate(req.body?.date || req.body?.expenseDate) || new Date(); const referenceNo = text(req.body?.voucherNo || req.body?.referenceNo) || `EXP-${Date.now()}`; const business = await db.business.findUnique({ where: { id: t.businessId }, select: { currency: true } }); const currency = text(req.body?.currency || business?.currency || "QAR").toUpperCase(); const exchangeRate = Math.max(0.0000001, num(req.body?.exchangeRate, 1)); const metadata = { paymentMethod: text(req.body?.paymentMethod || "cash"), paymentAccountId: text(req.body?.paymentAccountId) || null, supplierPayee: text(req.body?.supplierPayee) || null, counterId: text(req.body?.counterId) || null, vanId: text(req.body?.vanId) || null, notes: text(req.body?.notes) || null, attachment: text(req.body?.attachment) || null, tax: round2(num(req.body?.tax)), voucherNo: referenceNo };
    const result = await db.$transaction(async (tx: any) => { const expense = await tx.expense.create({ data: { businessId: t.businessId, accountId: text(req.body?.expenseAccountId) || null, branchId: text(req.body?.branchId) || null, createdByUserId: t.userId, category: text(req.body?.category || "General Expense"), description: text(req.body?.description) || null, amount, currency, exchangeRate, baseAmount: round2(amount * exchangeRate), exchangeRateSource: text(req.body?.exchangeRateSource || "manual"), exchangeRateTimestamp: new Date(), referenceNo, expenseDate, metadata } }); const posting = await postGroceryExpenseAccounting(tx, { businessId: t.businessId, userId: t.userId, expense, paymentMethod: metadata.paymentMethod }); await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.expense.create", entityType: "Expense", entityId: expense.id, after: { referenceNo, amount, category: expense.category, posting } }); return { expense, posting }; }); return ok(res, result, 201);
  } catch (e) { return fail(res, e); }
}
export async function groceryExpenseReport(req: Request, res: Response) {
  try { const t = tenant(req); const rows = await db.expense.findMany({ where: { businessId: t.businessId }, orderBy: { expenseDate: "desc" }, take: 10000 }); const groupBy = text(req.query.groupBy || "category"); const map = new Map<string, number>(); for (const x of rows) { const m = json(x.metadata); const key = groupBy === "paymentMethod" ? text(m.paymentMethod || "Unknown") : groupBy === "branch" ? text(x.branchId || "Unassigned") : groupBy === "user" ? text(x.createdByUserId || "Unknown") : groupBy === "van" ? text(m.vanId || "Not Van") : groupBy === "month" ? new Date(x.expenseDate).toISOString().slice(0, 7) : text(x.category || "Uncategorized"); map.set(key, (map.get(key) || 0) + num(x.baseAmount || x.amount)); } const total = round2([...map.values()].reduce((s, x) => s + x, 0)); return ok(res, { groupBy, total, rows: [...map].map(([key, amount]) => ({ key, amount: round2(amount), percentageOfTotal: total === 0 ? 0 : round2(amount / total * 100) })).sort((a, b) => b.amount - a.amount) }); } catch (e) { return fail(res, e); }
}

export async function reconcileGroceryAccountingSource(req: Request, res: Response) {
  try {
    const t = tenant(req); const type = text(req.params.type).toLowerCase(); const id = text(req.params.id); const result = await db.$transaction(async (tx: any) => {
      if (type === "customer-payment") { const payment = await tx.customerPayment.findFirst({ where: { id, businessId: t.businessId } }); if (!payment) throw new Error("Customer payment not found"); return postGroceryCustomerPaymentAccounting(tx, { businessId: t.businessId, userId: t.userId, payment }); }
      if (type === "supplier-payment") { const payment = await tx.supplierPayment.findFirst({ where: { id, businessId: t.businessId } }); if (!payment) throw new Error("Supplier payment not found"); return postGrocerySupplierPaymentAccounting(tx, { businessId: t.businessId, userId: t.userId, payment }); }
      if (type === "expense") { const expense = await tx.expense.findFirst({ where: { id, businessId: t.businessId } }); if (!expense) throw new Error("Expense not found"); return postGroceryExpenseAccounting(tx, { businessId: t.businessId, userId: t.userId, expense }); }
      if (type === "sale") { const document = await tx.salesDocument.findFirst({ where: { id, businessId: t.businessId, documentType: "INVOICE" } }); if (!document) throw new Error("Sale not found"); const snap = json(json(document.metadata).groceryCostSnapshot); return postGrocerySaleAccounting(tx, { businessId: t.businessId, userId: t.userId, document, cogs: num(snap.totalCogs) }); }
      throw new Error("Unsupported accounting source type");
    }); return ok(res, result);
  } catch (e) { return fail(res, e); }
}
