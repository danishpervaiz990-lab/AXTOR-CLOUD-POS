import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requirePersistentIdempotency } from "../middleware/idempotency.middleware.js";
import { nextEntityNumber } from "../services/numbering.service.js";
import { writeAudit } from "../services/audit.service.js";
import { ApiError, handleError, tenant } from "../utils/http.js";

const router = Router();
router.use(requireAuth);

const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const text = (v: unknown) => String(v ?? "").trim();
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const round3 = (v: number) => Math.round((v + Number.EPSILON) * 1000) / 1000;

async function requireGrocery(businessId: string) {
  const selected = await prisma.businessIndustry.findUnique({ where: { businessId }, include: { industry: { select: { code: true } } } });
  if (String(selected?.industry?.code || "").toLowerCase() !== "grocery") throw new ApiError(403, "Grocery industry access required");
}

router.post("/receiving", requirePersistentIdempotency("grocery.receiving"), async (req: Request, res: Response) => {
  try {
    const t = tenant(req); await requireGrocery(t.businessId);
    const input = req.body || {}; const items = Array.isArray(input.items) ? input.items : [];
    if (!items.length) throw new ApiError(400, "At least one received item is required");
    const supplier = await prisma.supplier.findFirst({ where: { id: text(input.supplierId), businessId: t.businessId, active: true } });
    const warehouse = await prisma.warehouse.findFirst({ where: { id: text(input.warehouseId), businessId: t.businessId, active: true } });
    if (!supplier || !warehouse) throw new ApiError(400, "Valid supplier and warehouse are required");
    const result = await prisma.$transaction(async (tx: any) => {
      const freight = Math.max(0, round2(num(input.freight)));
      const totalUnits = items.reduce((s: number, i: any) => s + num(i.quantity) + num(i.freeQuantity), 0);
      if (totalUnits <= 0) throw new ApiError(400, "Received quantity must be greater than zero");
      const normalized = [];
      for (const raw of items) {
        const product = await tx.product.findFirst({ where: { id: text(raw.productId), businessId: t.businessId, active: true, deleted: false } });
        if (!product) throw new ApiError(400, "Invalid Grocery product");
        const paidQty = round3(num(raw.quantity)); const freeQty = round3(num(raw.freeQuantity)); const qty = round3(paidQty + freeQty);
        const cost = round2(num(raw.cost)); const batchNo = text(raw.batchNo); const expiryDate = new Date(raw.expiryDate);
        if (paidQty <= 0 || freeQty < 0 || cost < 0 || !batchNo || Number.isNaN(expiryDate.getTime())) throw new ApiError(400, `Invalid receiving data for ${product.name}`);
        if (expiryDate.getTime() < new Date(new Date().toDateString()).getTime()) throw new ApiError(400, `${product.name}: expiry date cannot be in the past`);
        const landed = round2(cost + freight / totalUnits);
        normalized.push({ product, paidQty, freeQty, qty, cost, landed, batchNo, expiryDate });
      }
      const subtotal = round2(normalized.reduce((s, i) => s + i.paidQty * i.cost, 0));
      const purchaseNo = await nextEntityNumber(tx, "purchase", "purchaseNo", t.businessId, "PO");
      const purchase = await tx.purchase.create({ data: { businessId: t.businessId, warehouseId: warehouse.id, purchaseNo, supplierId: supplier.id, supplierName: supplier.name, referenceNo: text(input.supplierInvoiceNo) || null, purchaseDate: input.supplierInvoiceDate ? new Date(input.supplierInvoiceDate) : new Date(), subtotal, total: round2(subtotal + freight), balance: round2(subtotal + freight), status: "POSTED", receivedAt: new Date(), metadata: { freight, groceryReceiving: true }, items: { create: normalized.map(i => ({ businessId: t.businessId, productId: i.product.id, sku: i.product.sku, barcode: i.product.barcode, name: i.product.name, qty: i.paidQty, cost: i.cost, total: round2(i.paidQty * i.cost), discount: 0, taxRate: 0, tax: 0 })) } }, include: { items: true } });
      const receiptNo = await nextEntityNumber(tx, "goodsReceipt", "receiptNo", t.businessId, "GRN");
      await tx.goodsReceipt.create({ data: { businessId: t.businessId, purchaseId: purchase.id, receiptNo, warehouseId: warehouse.id, receivedByUserId: t.userId, items: { create: normalized.map(i => ({ businessId: t.businessId, productId: i.product.id, sku: i.product.sku, productName: i.product.name, qty: i.qty, cost: i.landed })) } } });
      for (const i of normalized) {
        const existing = await tx.inventoryBatch.findFirst({ where: { businessId: t.businessId, productId: i.product.id, warehouseId: warehouse.id, batchNo: i.batchNo } });
        if (existing && existing.expiryDate && existing.expiryDate.getTime() !== i.expiryDate.getTime()) throw new ApiError(409, `Batch ${i.batchNo} already exists with a different expiry date`);
        if (existing) await tx.inventoryBatch.update({ where: { id: existing.id }, data: { qtyOnHandBase: { increment: i.qty }, costPerBaseUnit: i.landed, status: "available", revision: { increment: 1 }, updatedByUserId: t.userId } });
        else await tx.inventoryBatch.create({ data: { businessId: t.businessId, productId: i.product.id, warehouseId: warehouse.id, batchNo: i.batchNo, expiryDate: i.expiryDate, qtyOnHandBase: i.qty, qtyReservedBase: 0, costPerBaseUnit: i.landed, status: "available", createdByUserId: t.userId, updatedByUserId: t.userId } });
        const stock = await tx.inventoryStock.findUnique({ where: { businessId_productId_warehouseId: { businessId: t.businessId, productId: i.product.id, warehouseId: warehouse.id } } });
        const before = num(stock?.qtyOnHand);
        await tx.inventoryStock.upsert({ where: { businessId_productId_warehouseId: { businessId: t.businessId, productId: i.product.id, warehouseId: warehouse.id } }, create: { businessId: t.businessId, productId: i.product.id, warehouseId: warehouse.id, qtyOnHand: i.qty }, update: { qtyOnHand: { increment: i.qty } } });
        await tx.product.update({ where: { id: i.product.id }, data: { currentStock: { increment: i.qty }, costPrice: i.landed } });
        await tx.stockMovement.create({ data: { businessId: t.businessId, movementNo: await nextEntityNumber(tx, "stockMovement", "movementNo", t.businessId, "MOV"), productId: i.product.id, sku: i.product.sku, productName: i.product.name, warehouseId: warehouse.id, direction: "IN", movementType: "GROCERY_RECEIPT", referenceNo: purchaseNo, qty: i.qty, beforeQty: before, afterQty: round3(before + i.qty), source: "grocery_receiving", metadata: { purchaseId: purchase.id, batchNo: i.batchNo, expiryDate: i.expiryDate, freeQuantity: i.freeQty, landedCost: i.landed } } });
      }
      await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { increment: round2(subtotal + freight) } } });
      await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.receiving", entityType: "Purchase", entityId: purchase.id, after: { purchaseNo, receiptNo, itemCount: normalized.length, total: round2(subtotal + freight) } });
      return { purchaseId: purchase.id, purchaseNo, receiptNo, total: round2(subtotal + freight) };
    });
    res.status(201).json({ ok: true, data: result });
  } catch (e) { handleError(res, e); }
});

router.post("/waste", requirePersistentIdempotency("grocery.waste"), async (req: Request, res: Response) => {
  try {
    const t = tenant(req); await requireGrocery(t.businessId);
    const input = req.body || {}; const batchId = text(input.batchId); const qty = round3(num(input.quantity));
    if (!batchId || qty <= 0 || !text(input.reason)) throw new ApiError(400, "Batch, positive quantity and reason are required");
    const result = await prisma.$transaction(async (tx: any) => {
      const batch = await tx.inventoryBatch.findFirst({ where: { id: batchId, businessId: t.businessId } });
      if (!batch) throw new ApiError(404, "Inventory batch not found");
      const available = round3(num(batch.qtyOnHandBase) - num(batch.qtyReservedBase));
      if (qty > available) throw new ApiError(409, `Waste quantity exceeds available batch stock (${available})`);
      const product = await tx.product.findFirst({ where: { id: batch.productId, businessId: t.businessId } });
      if (!product) throw new ApiError(404, "Product not found");
      const changed = await tx.inventoryBatch.updateMany({ where: { id: batch.id, businessId: t.businessId, qtyOnHandBase: { gte: qty } }, data: { qtyOnHandBase: { decrement: qty }, revision: { increment: 1 }, updatedByUserId: t.userId } });
      if (!changed.count) throw new ApiError(409, "Batch stock changed; reload and try again");
      const stock = await tx.inventoryStock.findUnique({ where: { businessId_productId_warehouseId: { businessId: t.businessId, productId: product.id, warehouseId: batch.warehouseId } } });
      const before = num(stock?.qtyOnHand);
      if (before + 0.0001 < qty) throw new ApiError(409, "Warehouse stock is lower than requested waste quantity");
      await tx.inventoryStock.update({ where: { businessId_productId_warehouseId: { businessId: t.businessId, productId: product.id, warehouseId: batch.warehouseId } }, data: { qtyOnHand: { decrement: qty } } });
      await tx.product.update({ where: { id: product.id }, data: { currentStock: { decrement: qty } } });
      const wasteNo = await nextEntityNumber(tx, "stockMovement", "movementNo", t.businessId, "WST");
      const costImpact = round2(qty * num(batch.costPerBaseUnit));
      await tx.stockMovement.create({ data: { businessId: t.businessId, movementNo: wasteNo, productId: product.id, sku: product.sku, productName: product.name, warehouseId: batch.warehouseId, direction: "OUT", movementType: "GROCERY_WASTE", referenceNo: wasteNo, qty, beforeQty: before, afterQty: round3(before - qty), source: "grocery_waste", metadata: { batchId: batch.id, batchNo: batch.batchNo, reason: text(input.reason), notes: text(input.notes) || null, costImpact } } });
      await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.waste", entityType: "InventoryBatch", entityId: batch.id, after: { wasteNo, qty, reason: text(input.reason), costImpact } });
      return { wasteNo, batchId: batch.id, quantity: qty, costImpact };
    });
    res.status(201).json({ ok: true, data: result });
  } catch (e) { handleError(res, e); }
});

export default router;
