import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { createSalesDocument } from "./sales-documents.controller.js";
import { writeAudit } from "../services/audit.service.js";

const db: any = prisma;
function num(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function json(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }

async function captureCostSnapshot(req: Request, documentId: string) {
  const businessId = req.tenant?.businessId;
  const userId = req.tenant?.userId;
  if (!businessId || !documentId) return null;
  return db.$transaction(async (tx: any) => {
    const document = await tx.salesDocument.findFirst({
      where: { id: documentId, businessId },
      include: { items: { include: { inventoryBatch: true } } },
    });
    if (!document) return null;
    const metadata = json(document.metadata);
    if (json(metadata.groceryCostSnapshot).version) return metadata.groceryCostSnapshot;
    const productIds = [...new Set((document.items || []).map((item: any) => item.productId).filter(Boolean))];
    const products = productIds.length ? await tx.product.findMany({ where: { businessId, id: { in: productIds } } }) : [];
    const productById = new Map(products.map((product: any) => [String(product.id), product]));
    const snapshots = (document.items || []).map((item: any) => {
      const qty = num(item.qty);
      const batch = item.inventoryBatch;
      const product: any = item.productId ? productById.get(String(item.productId)) : null;
      let baseQty = qty;
      let unitCostBase = num(product?.costPrice);
      let source = "product_cost_at_post";
      if (batch) {
        const saleUnit = String(item.unit || "").toLowerCase();
        const baseUnit = String(batch.smallestUnit || "").toLowerCase();
        const multiplier = saleUnit && baseUnit && saleUnit === baseUnit ? 1 : Math.max(1, num(batch.unitsPerStockUnit, 1));
        baseQty = qty * multiplier;
        unitCostBase = num(batch.costPerBaseUnit);
        source = "inventory_batch_cost_at_post";
      }
      const cogs = round2(baseQty * unitCostBase);
      return { salesDocumentItemId: item.id, productId: item.productId, inventoryBatchId: item.inventoryBatchId || null, qty, baseQty, unitCostBase, cogs, source };
    });
    const snapshot = { version: 1, capturedAt: new Date().toISOString(), totalCogs: round2(snapshots.reduce((sum: number, row: any) => sum + row.cogs, 0)), items: snapshots };
    await tx.salesDocument.update({ where: { id: document.id }, data: { metadata: { ...metadata, groceryCostSnapshot: snapshot } } });
    await writeAudit(tx, req, { businessId, userId, action: "grocery.sale.cost_snapshot", entityType: "sales_document", entityId: document.id, after: { totalCogs: snapshot.totalCogs, itemCount: snapshots.length } });
    return snapshot;
  });
}

export async function groceryCreateSale(req: Request, res: Response) {
  let statusCode = 200;
  let payload: any = null;
  const captureResponse: any = {
    status(code: number) { statusCode = code; return this; },
    json(body: any) { payload = body; return this; },
  };
  await createSalesDocument(req, captureResponse as Response);
  if (!payload?.ok || !payload?.data?.id) return res.status(statusCode).json(payload);
  try {
    const snapshot = await captureCostSnapshot(req, payload.data.id);
    payload.data.metadata = { ...(payload.data.metadata || {}), ...(snapshot ? { groceryCostSnapshot: snapshot } : {}) };
  } catch (error: any) {
    console.error("grocery sale cost snapshot error:", error);
    payload.costSnapshotWarning = "Sale posted successfully, but the COGS snapshot could not be refreshed.";
  }
  return res.status(statusCode).json(payload);
}
