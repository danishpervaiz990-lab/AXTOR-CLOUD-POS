import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";
import { nextEntityNumber } from "../services/numbering.service.js";
import { postGroceryPurchaseAccounting } from "../services/grocery-accounting.service.js";

const db: any = prisma;
function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function round3(value: number) { return Math.round((value + Number.EPSILON) * 1000) / 1000; }
function asDate(value: unknown): Date | null { if (!value) return null; const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? null : d; }
function json(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function dayStart(date = new Date()) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function fail(res: Response, message: string, status = 400, code = "PURCHASE_RECEIVE_FAILED") { return res.status(status).json({ ok: false, error: { code, message } }); }

export async function groceryReceivePurchaseWithAccounting(req: Request, res: Response) {
  try {
    const businessId = req.tenant?.businessId;
    const userId = req.tenant?.userId;
    if (!businessId || !userId) return fail(res, "Authenticated tenant and user are required", 401, "UNAUTHORIZED");
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!rawItems.length) return fail(res, "At least one received item is required", 422, "RECEIPT_ITEMS_REQUIRED");

    const result = await db.$transaction(async (tx: any) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: req.params.id, businessId },
        include: { items: true, goodsReceipts: { include: { items: true } } },
      });
      if (!purchase) throw new Error("Purchase not found");
      if (purchase.status === "CANCELLED") throw new Error("Cancelled purchase cannot be received");
      if (purchase.status === "POSTED" && purchase.receivedAt) throw new Error("Purchase is already fully received");

      const warehouseId = text(req.body?.warehouseId || purchase.warehouseId);
      const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, businessId, active: true } });
      if (!warehouse) throw new Error("Valid receiving warehouse is required");

      const orderedByProduct = new Map<string, number>();
      for (const item of purchase.items) {
        if (!item.productId) continue;
        const id = String(item.productId);
        orderedByProduct.set(id, round3((orderedByProduct.get(id) || 0) + num(item.qty)));
      }
      const receivedBefore = new Map<string, number>();
      for (const receipt of purchase.goodsReceipts) {
        for (const item of receipt.items || []) {
          if (!item.productId) continue;
          const id = String(item.productId);
          receivedBefore.set(id, round3((receivedBefore.get(id) || 0) + num(item.qty)));
        }
      }

      const normalized: any[] = [];
      const requestedTotals = new Map<string, number>();
      for (const raw of rawItems) {
        const productId = text(raw.productId);
        const product = await tx.product.findFirst({ where: { id: productId, businessId, active: true, deleted: false } });
        if (!product || !orderedByProduct.has(productId)) throw new Error("One received product is not on this purchase order");
        const qty = round3(num(raw.quantity ?? raw.qty));
        if (qty <= 0) throw new Error(`Received quantity must be positive for ${product.name}`);
        const requested = round3((requestedTotals.get(productId) || 0) + qty);
        const available = round3((orderedByProduct.get(productId) || 0) - (receivedBefore.get(productId) || 0));
        if (requested > available + 0.0001) throw new Error(`Received quantity exceeds remaining PO quantity for ${product.name}. Remaining: ${available}`);
        requestedTotals.set(productId, requested);
        const ordered = purchase.items.find((item: any) => String(item.productId) === productId);
        const cost = round2(num(raw.cost ?? raw.unitCost, ordered?.cost));
        const batchNo = text(raw.batchNo || raw.batch) || `AUTO-${purchase.purchaseNo}-${product.sku}-${Date.now()}`;
        const expiryDate = asDate(raw.expiryDate);
        const productionDate = asDate(raw.manufacturingDate || raw.productionDate);
        if (expiryDate && expiryDate < dayStart()) throw new Error(`${product.name}: expiry date cannot be in the past`);
        normalized.push({ product, qty, cost, batchNo, expiryDate, productionDate });
      }

      const receiptNo = text(req.body?.receiptNo) || await nextEntityNumber(tx, "goodsReceipt", "receiptNo", businessId, "GRN");
      const receipt = await tx.goodsReceipt.create({
        data: {
          businessId,
          purchaseId: purchase.id,
          receiptNo,
          warehouseId: warehouse.id,
          receivedByUserId: userId,
          notes: text(req.body?.notes) || null,
          items: { create: normalized.map(item => ({ businessId, productId: item.product.id, sku: item.product.sku, productName: item.product.name, qty: item.qty, cost: item.cost })) },
        },
        include: { items: true },
      });

      for (const item of normalized) {
        const existingBatch = await tx.inventoryBatch.findFirst({ where: { businessId, productId: item.product.id, warehouseId: warehouse.id, batchNo: item.batchNo } });
        if (existingBatch && item.expiryDate && existingBatch.expiryDate && new Date(existingBatch.expiryDate).getTime() !== item.expiryDate.getTime()) {
          throw new Error(`Batch ${item.batchNo} already exists with a different expiry date`);
        }
        if (existingBatch) {
          const oldQty = num(existingBatch.qtyOnHandBase);
          const oldCost = num(existingBatch.costPerBaseUnit);
          const newQty = round3(oldQty + item.qty);
          const weightedCost = newQty > 0 ? round2(((oldQty * oldCost) + (item.qty * item.cost)) / newQty) : item.cost;
          await tx.inventoryBatch.update({
            where: { id: existingBatch.id },
            data: {
              qtyOnHandBase: { increment: item.qty },
              costPerBaseUnit: weightedCost,
              ...(item.expiryDate ? { expiryDate: item.expiryDate } : {}),
              ...(item.productionDate ? { productionDate: item.productionDate } : {}),
              status: "available",
              metadata: { ...json(existingBatch.metadata), supplierId: purchase.supplierId, supplierName: purchase.supplierName, purchaseId: purchase.id, purchaseNo: purchase.purchaseNo, receiptNo },
              revision: { increment: 1 },
              updatedByUserId: userId,
            },
          });
        } else {
          await tx.inventoryBatch.create({
            data: {
              businessId,
              productId: item.product.id,
              warehouseId: warehouse.id,
              batchNo: item.batchNo,
              productionDate: item.productionDate,
              expiryDate: item.expiryDate,
              smallestUnit: item.product.unit || "PCS",
              unitsPerStockUnit: 1,
              qtyOnHandBase: item.qty,
              qtyReservedBase: 0,
              costPerBaseUnit: item.cost,
              status: "available",
              metadata: { supplierId: purchase.supplierId, supplierName: purchase.supplierName, purchaseId: purchase.id, purchaseNo: purchase.purchaseNo, receiptNo },
              createdByUserId: userId,
              updatedByUserId: userId,
            },
          });
        }

        const stock = await tx.inventoryStock.findUnique({ where: { businessId_productId_warehouseId: { businessId, productId: item.product.id, warehouseId: warehouse.id } } });
        const before = num(stock?.qtyOnHand);
        await tx.inventoryStock.upsert({
          where: { businessId_productId_warehouseId: { businessId, productId: item.product.id, warehouseId: warehouse.id } },
          create: { businessId, productId: item.product.id, warehouseId: warehouse.id, qtyOnHand: item.qty },
          update: { qtyOnHand: { increment: item.qty } },
        });
        await tx.product.update({ where: { id: item.product.id }, data: { currentStock: { increment: item.qty }, costPrice: item.cost } });
        await tx.stockMovement.create({
          data: {
            businessId,
            movementNo: await nextEntityNumber(tx, "stockMovement", "movementNo", businessId, "MOV"),
            productId: item.product.id,
            sku: item.product.sku,
            productName: item.product.name,
            warehouseId: warehouse.id,
            direction: "IN",
            movementType: "GROCERY_PO_RECEIPT",
            referenceNo: receiptNo,
            qty: item.qty,
            beforeQty: before,
            afterQty: round3(before + item.qty),
            source: "grocery_purchase_receiving",
            metadata: { purchaseId: purchase.id, purchaseNo: purchase.purchaseNo, receiptNo, batchNo: item.batchNo, expiryDate: item.expiryDate, unitCost: item.cost },
          },
        });
      }

      const receivedAfter = new Map(receivedBefore);
      for (const [productId, qty] of requestedTotals) receivedAfter.set(productId, round3((receivedAfter.get(productId) || 0) + qty));
      const fullyReceived = [...orderedByProduct.entries()].every(([productId, qty]) => (receivedAfter.get(productId) || 0) + 0.0001 >= qty);
      const oldMetadata = json(purchase.metadata);
      const workflowStatus = fullyReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED";
      const updateData: any = {
        warehouseId: warehouse.id,
        metadata: { ...oldMetadata, workflowStatus, lastReceiptNo: receiptNo, lastReceivedAt: new Date().toISOString() },
      };
      let accounting: any = null;
      if (fullyReceived) {
        updateData.status = "POSTED";
        updateData.receivedAt = new Date();
        if (purchase.supplierId) await tx.supplier.update({ where: { id: purchase.supplierId }, data: { balance: { increment: num(purchase.balance) } } });
        accounting = await postGroceryPurchaseAccounting(tx, {
          businessId,
          userId,
          purchaseId: purchase.id,
          purchaseNo: purchase.purchaseNo,
          purchaseDate: purchase.purchaseDate,
          amount: num(purchase.total),
        });
        updateData.metadata = { ...updateData.metadata, accountingPosted: true, accountingAmount: num(purchase.total), accountingPostedAt: new Date().toISOString() };
      }
      const updated = await tx.purchase.update({ where: { id: purchase.id }, data: updateData });
      await writeAudit(tx, req, {
        businessId,
        userId,
        action: "grocery.purchase.receive",
        entityType: "Purchase",
        entityId: purchase.id,
        after: { receiptNo, workflowStatus, fullyReceived, accounting, items: normalized.map(item => ({ productId: item.product.id, quantity: item.qty, batchNo: item.batchNo, unitCost: item.cost })) },
      });
      return { purchase: updated, receipt, workflowStatus, fullyReceived, accounting, receivedByProduct: Object.fromEntries(receivedAfter) };
    });
    return res.status(201).json({ ok: true, data: result });
  } catch (error: any) {
    return fail(res, error?.message || "Failed to receive purchase", 400);
  }
}
