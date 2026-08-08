import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";
import { nextEntityNumber } from "../services/numbering.service.js";
import { readGroceryProductProfile, resolveGroceryUom } from "./grocery-product-uom.controller.js";

const db: any = prisma;
const DAY = 86_400_000;
function text(v: unknown) { return String(v ?? "").trim(); }
function num(v: unknown, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function round2(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function round3(v: number) { return Math.round((v + Number.EPSILON) * 1000) / 1000; }
function json(v: unknown): Record<string, any> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {}; }
function asDate(v: unknown) { if (!v) return null; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d; }
function dayStart(date = new Date()) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function addDays(date: Date, days: number) { return new Date(date.getTime() + days * DAY); }
function fail(res: Response, e: any, status = 400, code = "GROCERY_PURCHASE_UOM_FAILED") { return res.status(status).json({ ok: false, error: { code, message: e?.message || String(e || "Request failed") } }); }
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok: true, data }); }
function tenant(req: Request) { const businessId = req.tenant?.businessId; const userId = req.tenant?.userId; if (!businessId || !userId) throw new Error("Authenticated Grocery tenant is required"); return { businessId, userId }; }

type LineExtra = { productId: string; uom: string; uomMultiplier: number; baseQuantity: number; costPerBaseUnit: number; packQuantity: number; batch: string | null; manufacturingDate: string | null; expiryDate: string | null };
function purchaseLineExtras(purchase: any): LineExtra[] { const rows = json(purchase?.metadata).lineExtras; return Array.isArray(rows) ? rows : []; }
function extraForProduct(purchase: any, product: any) {
  const found = purchaseLineExtras(purchase).find(x => text(x.productId) === text(product.id));
  if (found) {
    const unit = text(found.uom || product.unit || "PCS").toUpperCase();
    let multiplier = Math.max(0.0001, num(found.uomMultiplier, 0));
    if (!multiplier) multiplier = resolveGroceryUom(product, unit).multiplier;
    return { ...found, uom: unit, uomMultiplier: multiplier };
  }
  const resolved = resolveGroceryUom(product, product.unit || "PCS");
  return { productId: product.id, uom: resolved.unit, uomMultiplier: resolved.multiplier, baseQuantity: 0, costPerBaseUnit: 0, packQuantity: 1, batch: null, manufacturingDate: null, expiryDate: null };
}

function receivedCoverage(purchase: any) {
  const ordered = new Map<string, number>();
  for (const item of purchase.items || []) if (item.productId) ordered.set(String(item.productId), round3((ordered.get(String(item.productId)) || 0) + num(item.qty)));
  const received = new Map<string, number>();
  for (const receipt of purchase.goodsReceipts || []) for (const item of receipt.items || []) if (item.productId) received.set(String(item.productId), round3((received.get(String(item.productId)) || 0) + num(item.qty)));
  const fullyReceived = ordered.size > 0 && [...ordered].every(([id, qty]) => (received.get(id) || 0) + 0.0001 >= qty);
  return { ordered, received, fullyReceived };
}

export async function groceryCreatePurchaseOrderUom(req: Request, res: Response) {
  try {
    const t = tenant(req); const input = req.body || {};
    const supplier = await db.supplier.findFirst({ where: { id: text(input.supplierId), businessId: t.businessId, active: true } });
    const warehouse = await db.warehouse.findFirst({ where: { id: text(input.warehouseId), businessId: t.businessId, active: true } });
    if (!supplier || !warehouse) throw new Error("Valid supplier and destination warehouse are required");
    const rawItems = Array.isArray(input.items) ? input.items : []; if (!rawItems.length) throw new Error("At least one purchase item is required");
    const result = await db.$transaction(async (tx: any) => {
      const items: any[] = []; const extras: LineExtra[] = []; const seen = new Set<string>();
      for (const raw of rawItems) {
        const product = await tx.product.findFirst({ where: { id: text(raw.productId), businessId: t.businessId, active: true, deleted: false } });
        if (!product) throw new Error("One selected product is invalid");
        if (seen.has(product.id)) throw new Error(`${product.name}: add the product once per PO so its UOM and receiving coverage are unambiguous`); seen.add(product.id);
        const quantity = round3(num(raw.quantity ?? raw.qty)); const costPerPurchaseUnit = round2(num(raw.unitCost ?? raw.cost));
        if (quantity <= 0 || costPerPurchaseUnit < 0) throw new Error(`Invalid quantity or cost for ${product.name}`);
        const resolved = resolveGroceryUom(product, raw.uom || product.unit);
        const baseQuantity = round3(quantity * resolved.multiplier);
        const costPerBaseUnit = resolved.multiplier > 0 ? round2(costPerPurchaseUnit / resolved.multiplier) : costPerPurchaseUnit;
        const discount = round2(Math.max(0, num(raw.discount))); const taxRate = round2(Math.max(0, num(raw.taxRate ?? raw.tax)));
        const taxable = round2(quantity * costPerPurchaseUnit - discount); const tax = round2(taxable * taxRate / 100);
        items.push({ businessId: t.businessId, productId: product.id, sku: product.sku, barcode: product.barcode, name: product.name, qty: quantity, cost: costPerPurchaseUnit, discount, taxRate, tax, total: round2(taxable + tax) });
        extras.push({ productId: product.id, uom: resolved.unit, uomMultiplier: resolved.multiplier, baseQuantity, costPerBaseUnit, packQuantity: num(raw.packQuantity, resolved.multiplier), batch: text(raw.batch) || null, manufacturingDate: asDate(raw.manufacturingDate)?.toISOString() || null, expiryDate: asDate(raw.expiryDate)?.toISOString() || null });
      }
      const subtotal = round2(items.reduce((s, x) => s + x.qty * x.cost, 0)); const discount = round2(items.reduce((s, x) => s + x.discount, 0)); const tax = round2(items.reduce((s, x) => s + x.tax, 0));
      const freight = round2(Math.max(0, num(input.freight))); const otherCharges = round2(Math.max(0, num(input.otherCharges))); const total = round2(subtotal - discount + tax + freight + otherCharges);
      const purchaseDate = asDate(input.purchaseDate) || new Date(); const dueDate = asDate(input.dueDate) || addDays(purchaseDate, Math.max(0, Math.trunc(num(input.creditDays, supplier.creditDays || 0))));
      const purchaseNo = text(input.poNumber) || await nextEntityNumber(tx, "purchase", "purchaseNo", t.businessId, "PO");
      const row = await tx.purchase.create({ data: {
        businessId: t.businessId, branchId: warehouse.branchId || null, warehouseId: warehouse.id, purchaseNo,
        supplierId: supplier.id, supplierName: supplier.name, referenceNo: text(input.supplierReference || input.supplierInvoiceNumber) || null,
        dueDate, purchaseDate, subtotal, discount, tax, total, paid: 0, balance: total, status: "DRAFT",
        metadata: { workflowStatus: "DRAFT", expectedDeliveryDate: asDate(input.expectedDeliveryDate)?.toISOString() || null, supplierReference: text(input.supplierReference) || null, supplierInvoiceNumber: text(input.supplierInvoiceNumber) || null, paymentTerms: text(input.paymentTerms) || null, freight, otherCharges, notes: text(input.notes) || null, uomAccountingVersion: 1, lineExtras: extras },
        items: { create: items },
      }, include: { items: true } });
      await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.purchase_order.create", entityType: "Purchase", entityId: row.id, after: { purchaseNo, total, workflowStatus: "DRAFT", uomAccountingVersion: 1, lineExtras: extras } });
      return { ...row, lineExtras: extras };
    });
    return ok(res, result, 201);
  } catch (e) { return fail(res, e, 400, "PURCHASE_CREATE_FAILED"); }
}

export async function groceryReceivePurchaseUom(req: Request, res: Response) {
  try {
    const t = tenant(req); const rawItems = Array.isArray(req.body?.items) ? req.body.items : []; if (!rawItems.length) throw new Error("At least one received item is required");
    const result = await db.$transaction(async (tx: any) => {
      const purchase = await tx.purchase.findFirst({ where: { id: req.params.id, businessId: t.businessId }, include: { items: true, goodsReceipts: { include: { items: true } } } });
      if (!purchase) throw new Error("Purchase not found"); if (purchase.status === "CANCELLED") throw new Error("Cancelled purchase cannot be received"); if (purchase.status === "POSTED") throw new Error("Posted purchase invoice cannot receive additional goods");
      const warehouseId = text(req.body?.warehouseId || purchase.warehouseId); const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, businessId: t.businessId, active: true } }); if (!warehouse) throw new Error("Valid receiving warehouse is required");
      const coverage = receivedCoverage(purchase); if (coverage.fullyReceived) throw new Error("Purchase order is already fully received");
      const requestedTotals = new Map<string, number>(); const normalized: any[] = [];
      for (const raw of rawItems) {
        const productId = text(raw.productId); const product = await tx.product.findFirst({ where: { id: productId, businessId: t.businessId, active: true, deleted: false } }); if (!product || !coverage.ordered.has(productId)) throw new Error("One received product is not on this purchase order");
        const orderedLine = purchase.items.find((x: any) => String(x.productId) === productId); if (!orderedLine) throw new Error("Purchase line not found");
        const extra = extraForProduct(purchase, product); const rawUnit = text(raw.uom); if (rawUnit && rawUnit.toUpperCase() !== extra.uom) throw new Error(`${product.name}: receive in PO UOM ${extra.uom}`);
        const purchaseQty = round3(num(raw.quantity ?? raw.qty)); if (purchaseQty <= 0) throw new Error(`Received quantity must be positive for ${product.name}`);
        const requested = round3((requestedTotals.get(productId) || 0) + purchaseQty); const remaining = round3((coverage.ordered.get(productId) || 0) - (coverage.received.get(productId) || 0)); if (requested > remaining + 0.0001) throw new Error(`Received quantity exceeds remaining PO quantity for ${product.name}. Remaining: ${remaining} ${extra.uom}`); requestedTotals.set(productId, requested);
        const purchaseUnitCost = round2(num(raw.cost ?? raw.unitCost, orderedLine.cost)); const baseQty = round3(purchaseQty * extra.uomMultiplier); const costPerBaseUnit = extra.uomMultiplier > 0 ? round2(purchaseUnitCost / extra.uomMultiplier) : purchaseUnitCost;
        const batchNo = text(raw.batchNo || raw.batch || extra.batch) || `AUTO-${purchase.purchaseNo}-${product.sku}-${Date.now()}`;
        const expiryDate = asDate(raw.expiryDate || extra.expiryDate); const productionDate = asDate(raw.manufacturingDate || raw.productionDate || extra.manufacturingDate); if (expiryDate && expiryDate < dayStart()) throw new Error(`${product.name}: expiry date cannot be in the past`);
        normalized.push({ product, purchaseQty, purchaseUnitCost, uom: extra.uom, uomMultiplier: extra.uomMultiplier, baseQty, costPerBaseUnit, batchNo, expiryDate, productionDate });
      }
      const receiptNo = text(req.body?.receiptNo) || await nextEntityNumber(tx, "goodsReceipt", "receiptNo", t.businessId, "GRN");
      const receipt = await tx.goodsReceipt.create({ data: { businessId: t.businessId, purchaseId: purchase.id, receiptNo, warehouseId: warehouse.id, receivedByUserId: t.userId, notes: text(req.body?.notes) || null, items: { create: normalized.map(i => ({ businessId: t.businessId, productId: i.product.id, sku: i.product.sku, productName: i.product.name, qty: i.purchaseQty, cost: i.purchaseUnitCost })) } }, include: { items: true } });
      for (const item of normalized) {
        const existingBatch = await tx.inventoryBatch.findFirst({ where: { businessId: t.businessId, productId: item.product.id, warehouseId: warehouse.id, batchNo: item.batchNo } });
        if (existingBatch && item.expiryDate && existingBatch.expiryDate && new Date(existingBatch.expiryDate).getTime() !== item.expiryDate.getTime()) throw new Error(`Batch ${item.batchNo} already exists with a different expiry date`);
        if (existingBatch) {
          const oldQty = num(existingBatch.qtyOnHandBase), oldCost = num(existingBatch.costPerBaseUnit), newQty = round3(oldQty + item.baseQty);
          const weightedCost = newQty > 0 ? round2(((oldQty * oldCost) + (item.baseQty * item.costPerBaseUnit)) / newQty) : item.costPerBaseUnit;
          await tx.inventoryBatch.update({ where: { id: existingBatch.id }, data: { qtyOnHandBase: { increment: item.baseQty }, costPerBaseUnit: weightedCost, ...(item.expiryDate ? { expiryDate: item.expiryDate } : {}), ...(item.productionDate ? { productionDate: item.productionDate } : {}), status: "available", metadata: { ...json(existingBatch.metadata), supplierId: purchase.supplierId, supplierName: purchase.supplierName, purchaseId: purchase.id, purchaseNo: purchase.purchaseNo, receiptNo, purchaseUom: item.uom, uomMultiplier: item.uomMultiplier, purchaseUnitCost: item.purchaseUnitCost }, revision: { increment: 1 }, updatedByUserId: t.userId } });
        } else {
          const profile = readGroceryProductProfile(item.product);
          await tx.inventoryBatch.create({ data: { businessId: t.businessId, productId: item.product.id, warehouseId: warehouse.id, batchNo: item.batchNo, productionDate: item.productionDate, expiryDate: item.expiryDate, smallestUnit: profile.baseUnit, unitsPerStockUnit: 1, qtyOnHandBase: item.baseQty, qtyReservedBase: 0, costPerBaseUnit: item.costPerBaseUnit, status: "available", metadata: { supplierId: purchase.supplierId, supplierName: purchase.supplierName, purchaseId: purchase.id, purchaseNo: purchase.purchaseNo, receiptNo, purchaseUom: item.uom, uomMultiplier: item.uomMultiplier, purchaseUnitCost: item.purchaseUnitCost }, createdByUserId: t.userId, updatedByUserId: t.userId } });
        }
        const stock = await tx.inventoryStock.findUnique({ where: { businessId_productId_warehouseId: { businessId: t.businessId, productId: item.product.id, warehouseId: warehouse.id } } }); const before = num(stock?.qtyOnHand);
        await tx.inventoryStock.upsert({ where: { businessId_productId_warehouseId: { businessId: t.businessId, productId: item.product.id, warehouseId: warehouse.id } }, create: { businessId: t.businessId, productId: item.product.id, warehouseId: warehouse.id, qtyOnHand: item.baseQty }, update: { qtyOnHand: { increment: item.baseQty } } });
        await tx.product.update({ where: { id: item.product.id }, data: { currentStock: { increment: item.baseQty }, costPrice: item.costPerBaseUnit } });
        await tx.stockMovement.create({ data: { businessId: t.businessId, movementNo: await nextEntityNumber(tx, "stockMovement", "movementNo", t.businessId, "MOV"), productId: item.product.id, sku: item.product.sku, productName: item.product.name, warehouseId: warehouse.id, direction: "IN", movementType: "GROCERY_PO_RECEIPT", referenceNo: receiptNo, qty: item.baseQty, beforeQty: before, afterQty: round3(before + item.baseQty), source: "grocery_purchase_receiving", metadata: { purchaseId: purchase.id, purchaseNo: purchase.purchaseNo, receiptNo, batchNo: item.batchNo, expiryDate: item.expiryDate, purchaseQuantity: item.purchaseQty, purchaseUom: item.uom, uomMultiplier: item.uomMultiplier, baseQuantity: item.baseQty, purchaseUnitCost: item.purchaseUnitCost, costPerBaseUnit: item.costPerBaseUnit } } });
      }
      const receivedAfter = new Map(coverage.received); for (const [id, qty] of requestedTotals) receivedAfter.set(id, round3((receivedAfter.get(id) || 0) + qty));
      const fullyReceived = [...coverage.ordered].every(([id, qty]) => (receivedAfter.get(id) || 0) + 0.0001 >= qty); const workflowStatus = fullyReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED"; const oldMeta = json(purchase.metadata);
      const updated = await tx.purchase.update({ where: { id: purchase.id }, data: { warehouseId: warehouse.id, ...(fullyReceived ? { receivedAt: new Date() } : {}), metadata: { ...oldMeta, workflowStatus, lastReceiptNo: receiptNo, lastReceivedAt: new Date().toISOString(), readyForPurchaseInvoice: fullyReceived, uomAccountingVersion: 1 } } });
      await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.purchase.receive", entityType: "Purchase", entityId: purchase.id, after: { receiptNo, workflowStatus, fullyReceived, items: normalized.map(i => ({ productId: i.product.id, purchaseQuantity: i.purchaseQty, uom: i.uom, uomMultiplier: i.uomMultiplier, baseQuantity: i.baseQty, batchNo: i.batchNo, purchaseUnitCost: i.purchaseUnitCost, costPerBaseUnit: i.costPerBaseUnit })) } });
      return { purchase: updated, receipt, workflowStatus, fullyReceived, receivedByProduct: Object.fromEntries(receivedAfter), baseQuantityReceived: normalized.reduce((s, x) => round3(s + x.baseQty), 0) };
    });
    return ok(res, result, 201);
  } catch (e) { return fail(res, e, 400, "PURCHASE_RECEIVE_FAILED"); }
}
