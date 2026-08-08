import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { createSalesDocument } from "./sales-documents.controller.js";
import { writeAudit } from "../services/audit.service.js";
import { postGrocerySaleAccounting } from "../services/grocery-accounting.service.js";
import { applyGrocerySaleLoyalty, evaluateGroceryPromotions, recordGroceryPromotionUsage } from "../services/grocery-31-40-commerce.service.js";

const db: any = prisma;
function num(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function json(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }

async function captureAndPost(req: Request, documentId: string, promotionEvaluation: any, commercial: any) {
  const businessId = req.tenant?.businessId, userId = req.tenant?.userId;
  if (!businessId || !documentId) return null;
  return db.$transaction(async (tx: any) => {
    const document = await tx.salesDocument.findFirst({ where: { id: documentId, businessId }, include: { items: { include: { inventoryBatch: true } } } });
    if (!document) return null;
    const metadata = json(document.metadata);
    const commercialMeta = {
      priceLevel: commercial?.priceLevel || "retail",
      authorizedPrices: commercial?.authorizedPrices || [],
      manualPriceOverrides: commercial?.manualPriceOverrides || [],
      manualDiscountOverride: Boolean(commercial?.manualDiscountOverride),
      promotions: promotionEvaluation?.appliedPromotions || [],
      promotionDiscount: round2(num(promotionEvaluation?.totalDiscount)),
      promotionStackingPrevented: Boolean(promotionEvaluation?.stackingPrevented),
    };
    let snapshot = json(metadata.groceryCostSnapshot);
    if (!snapshot.version) {
      const productIds = [...new Set((document.items || []).map((item: any) => item.productId).filter(Boolean))];
      const products = productIds.length ? await tx.product.findMany({ where: { businessId, id: { in: productIds } } }) : [];
      const productById = new Map<string, any>(products.map((product: any) => [String(product.id), product]));
      const rows = (document.items || []).map((item: any) => {
        const itemQty = num(item.qty), batch = item.inventoryBatch, product = item.productId ? productById.get(String(item.productId)) : null;
        let baseQty = itemQty, unitCostBase = num(product?.costPrice), source = "product_cost_at_post";
        if (batch) { const saleUnit = String(item.unit || "").toLowerCase(), baseUnit = String(batch.smallestUnit || "").toLowerCase(), multiplier = saleUnit && baseUnit && saleUnit === baseUnit ? 1 : Math.max(1, num(batch.unitsPerStockUnit, 1)); baseQty = itemQty * multiplier; unitCostBase = num(batch.costPerBaseUnit); source = "inventory_batch_cost_at_post"; }
        return { salesDocumentItemId: item.id, productId: item.productId, inventoryBatchId: item.inventoryBatchId || null, qty: itemQty, baseQty, unitCostBase, cogs: round2(baseQty * unitCostBase), source };
      });
      snapshot = { version: 1, capturedAt: new Date().toISOString(), totalCogs: round2(rows.reduce((sum: number, row: any) => sum + row.cogs, 0)), items: rows };
      await tx.salesDocument.update({ where: { id: document.id }, data: { metadata: { ...metadata, groceryCostSnapshot: snapshot, groceryCommercial: commercialMeta } } });
      document.metadata = { ...metadata, groceryCostSnapshot: snapshot, groceryCommercial: commercialMeta };
      await writeAudit(tx, req, { businessId, userId, action: "grocery.sale.cost_snapshot", entityType: "sales_document", entityId: document.id, after: { totalCogs: snapshot.totalCogs, itemCount: rows.length } });
    } else if (!metadata.groceryCommercial) {
      await tx.salesDocument.update({ where: { id: document.id }, data: { metadata: { ...metadata, groceryCommercial: commercialMeta } } });
      document.metadata = { ...metadata, groceryCommercial: commercialMeta };
    }
    const accounting = await postGrocerySaleAccounting(tx, { businessId, userId, document, cogs: num(snapshot.totalCogs) });
    await recordGroceryPromotionUsage(tx, businessId, userId || null, document, promotionEvaluation);
    const loyalty = await applyGrocerySaleLoyalty(tx, businessId, userId || null, document);
    await writeAudit(tx, req, { businessId, userId, action: "grocery.sale.accounting_posted", entityType: "sales_document", entityId: document.id, after: accounting });
    if (commercialMeta.manualPriceOverrides.length || commercialMeta.manualDiscountOverride) await writeAudit(tx, req, { businessId, userId, action: "grocery.sale.commercial_override", entityType: "sales_document", entityId: document.id, after: { priceOverrides: commercialMeta.manualPriceOverrides, discountOverride: commercialMeta.manualDiscountOverride, reason: String(req.body?.priceOverrideReason || req.body?.discountOverrideReason || "").trim() || null } });
    if (commercialMeta.promotions.length) await writeAudit(tx, req, { businessId, userId, action: "grocery.sale.promotions_applied", entityType: "sales_document", entityId: document.id, after: { promotions: commercialMeta.promotions, totalDiscount: commercialMeta.promotionDiscount } });
    return { snapshot, accounting, loyalty, commercial: commercialMeta };
  });
}

export async function groceryCreateSale(req: Request, res: Response) {
  const commercial = (req as any).groceryCommercial || { priceLevel: "retail", authorizedPrices: [], manualPriceOverrides: [], manualDiscountOverride: false };
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  for (let index = 0; index < items.length; index += 1) {
    const manual = (commercial.manualPriceOverrides || []).find((x: any) => Number(x.index) === index);
    const authorized = commercial.authorizedPrices?.[index];
    const appliedPrice = manual ? Number(manual.overridePrice) : Number(authorized?.price ?? items[index].unitPrice ?? items[index].rate ?? items[index].price ?? 0);
    items[index].unitPrice = appliedPrice; items[index].rate = appliedPrice; items[index].price = appliedPrice;
  }

  let promotionEvaluation: any = null;
  try {
    promotionEvaluation = await evaluateGroceryPromotions(req.tenant?.businessId as string, { items, customerId: req.body?.customerId, customerGroup: req.body?.customerGroup, promoCode: req.body?.promoCode || req.body?.couponCode });
    for (let index = 0; index < items.length; index += 1) {
      const manual = (commercial.manualPriceOverrides || []).some((x: any) => Number(x.index) === index);
      const promoPrice = promotionEvaluation?.priceOverrides?.[index];
      if (!manual && promoPrice !== undefined) { items[index].unitPrice = Number(promoPrice); items[index].rate = Number(promoPrice); items[index].price = Number(promoPrice); }
      const promoDiscount = Number(promotionEvaluation?.lineDiscounts?.[index] || 0);
      if (promoDiscount > 0) items[index].discountAmount = round2(Math.max(0, num(items[index].discountAmount ?? items[index].discount)) + promoDiscount);
    }
    const manualHeader = Math.max(0, num(req.body?.discount ?? req.body?.discountTotal));
    req.body.discount = round2(manualHeader + Math.max(0, num(promotionEvaluation?.invoiceDiscount)));
    (req as any).groceryAutomaticPromotion = promotionEvaluation;
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: { code: "PROMOTION_EVALUATION_FAILED", message: error?.message || "Promotion evaluation failed" } });
  }

  let statusCode = 200, payload: any = null;
  const captureResponse: any = { status(code: number) { statusCode = code; return this; }, json(body: any) { payload = body; return this; } };
  await createSalesDocument(req, captureResponse as Response);
  if (!payload?.ok || !payload?.data?.id) return res.status(statusCode).json(payload);
  try {
    const posted = await captureAndPost(req, payload.data.id, promotionEvaluation, commercial);
    if (posted?.snapshot) payload.data.metadata = { ...(payload.data.metadata || {}), groceryCostSnapshot: posted.snapshot, groceryCommercial: posted.commercial };
    payload.data.accounting = posted?.accounting || null; payload.data.loyalty = posted?.loyalty || null; payload.data.promotions = promotionEvaluation;
  } catch (error: any) {
    console.error("grocery sale accounting/commercial synchronization error:", error);
    payload.accountingWarning = `Sale posted, post-sale synchronization failed: ${error?.message || "unknown error"}`;
  }
  return res.status(statusCode).json(payload);
}
