import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { createSalesDocument } from "./sales-documents.controller.js";
import { writeAudit } from "../services/audit.service.js";
import { postGrocerySaleAccounting } from "../services/grocery-accounting.service.js";
import { applyGrocerySaleLoyalty, evaluateGroceryPromotions, recordGroceryPromotionUsage, resolveGroceryPrice } from "../services/grocery-31-40-commerce.service.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";
import { weightedAverageCosts } from "../services/grocery-41-50.service.js";
import { readGroceryProductProfile } from "./grocery-product-uom.controller.js";

const db: any = prisma;
function num(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function json(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function text(value: unknown) { return String(value ?? "").trim(); }

async function ensureCommercial(req: Request) {
  if ((req as any).groceryCommercial) return (req as any).groceryCommercial;
  const businessId = req.tenant?.businessId, userId = req.tenant?.userId;
  if (!businessId || !userId) throw new Error("Authenticated Grocery tenant is required");
  const access = await loadUserAccess(db, businessId, userId), items = Array.isArray(req.body?.items) ? req.body.items : [], customerId = text(req.body?.customerId) || null, priceLevel = text(req.body?.priceLevel || "retail").toLowerCase();
  const headerDiscount = Math.max(0, num(req.body?.discount ?? req.body?.discountTotal)), hasLineDiscount = items.some((item: any) => Math.max(0, num(item.discountAmount ?? item.discount)) > 0);
  if ((headerDiscount > 0 || hasLineDiscount) && !hasPermission(access, "discounts.override")) throw new Error("Manual discount requires discounts.override permission");
  const commercial: any = { priceLevel, customerId, authorizedPrices: [], manualPriceOverrides: [], manualDiscountOverride: headerDiscount > 0 || hasLineDiscount };
  for (let index = 0; index < items.length; index += 1) {
    const productId = text(items[index].productId); if (!productId) continue;
    const resolved = await resolveGroceryPrice(businessId, { productId, customerId, priceLevel }), raw = items[index].unitPrice ?? items[index].rate ?? items[index].price;
    const supplied = raw === undefined || raw === null || raw === "" ? Number(resolved.price) : round2(num(raw, Number(resolved.price))), manual = Math.abs(supplied - Number(resolved.price)) > .001;
    if (manual && !hasPermission(access, "pricing.manual_override")) throw new Error(`${resolved.productName}: manual price differs from authorized ${resolved.source} price`);
    commercial.authorizedPrices[index] = { productId, price: Number(resolved.price), source: resolved.source };
    if (manual) commercial.manualPriceOverrides.push({ index, productId, authorizedPrice: Number(resolved.price), overridePrice: supplied, reason: text(req.body?.priceOverrideReason || items[index].priceOverrideReason) || null });
  }
  (req as any).groceryCommercial = commercial; return commercial;
}

async function prepareWeightedValuation(req: Request) {
  const businessId = req.tenant?.businessId; if (!businessId) return;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const ids = [...new Set<string>(items.map((x: any) => text(x.productId)).filter(Boolean))];
  if (!ids.length) { (req as any).groceryWeightedValuation = {}; return; }
  const [costs, products] = await Promise.all([
    weightedAverageCosts(businessId, ids),
    db.product.findMany({ where: { businessId, id: { in: ids }, deleted: false } }),
  ]);
  const productMap = new Map<string, any>(products.map((p: any): [string, any] => [String(p.id), p]));
  const valuation: Record<string, any> = {};
  for (const id of ids) {
    const p = productMap.get(id); if (!p) continue;
    const row = costs.get(id), profile = readGroceryProductProfile(p);
    valuation[id] = { averageCost: row?.averageCost ?? Number(p.costPrice || 0), stockValue: row?.stockValue ?? 0, quantity: row?.quantity ?? Number(p.currentStock || 0), baseUnit: profile.baseUnit, uoms: profile.uoms, capturedAt: new Date().toISOString() };
  }
  (req as any).groceryWeightedValuation = valuation;
}

async function captureAndPost(tx: any, req: Request, documentId: string, promotionEvaluation: any, commercial: any) {
  const businessId = req.tenant?.businessId, userId = req.tenant?.userId; if (!businessId || !documentId) return null;
  const document = await tx.salesDocument.findFirst({ where: { id: documentId, businessId }, include: { items: { include: { inventoryBatch: true } } } }); if (!document) return null;
  const metadata = json(document.metadata), commercialMeta = { priceLevel: commercial?.priceLevel || "retail", authorizedPrices: commercial?.authorizedPrices || [], manualPriceOverrides: commercial?.manualPriceOverrides || [], manualDiscountOverride: Boolean(commercial?.manualDiscountOverride), promotions: promotionEvaluation?.appliedPromotions || [], promotionDiscount: round2(num(promotionEvaluation?.totalDiscount)), promotionStackingPrevented: Boolean(promotionEvaluation?.stackingPrevented) };
  let snapshot = json(metadata.groceryCostSnapshot);
  if (!snapshot.version) {
    const productIds = [...new Set((document.items || []).map((item: any) => item.productId).filter(Boolean))], products = productIds.length ? await tx.product.findMany({ where: { businessId, id: { in: productIds } } }) : [], productById = new Map<string, any>(products.map((product: any) => [String(product.id), product]));
    const valuation = json((req as any).groceryWeightedValuation);
    const rows = (document.items || []).map((item: any) => {
      const itemQty = num(item.qty), product = item.productId ? productById.get(String(item.productId)) : null, prepared = item.productId ? json(valuation[String(item.productId)]) : {};
      const profile = product ? readGroceryProductProfile(product) : null, saleUnit = text(item.unit || profile?.baseUnit).toUpperCase(), conversion = profile?.uoms?.find((u: any) => text(u.unit).toUpperCase() === saleUnit), multiplier = Math.max(.0001, num(conversion?.multiplier, 1));
      const baseQty = itemQty * multiplier, unitCostBase = num(prepared.averageCost, num(product?.costPrice)), source = prepared.capturedAt ? "moving_weighted_average_pre_sale" : "product_cost_fallback";
      return { salesDocumentItemId: item.id, productId: item.productId, inventoryBatchId: item.inventoryBatchId || null, qty: itemQty, baseQty, unitCostBase, cogs: round2(baseQty * unitCostBase), source };
    });
    snapshot = { version: 2, valuationMethod: "weighted_average", physicalRotation: "FEFO", capturedAt: new Date().toISOString(), totalCogs: round2(rows.reduce((sum: number, row: any) => sum + row.cogs, 0)), items: rows };
    await tx.salesDocument.update({ where: { id: document.id }, data: { metadata: { ...metadata, groceryCostSnapshot: snapshot, groceryCommercial: commercialMeta } } }); document.metadata = { ...metadata, groceryCostSnapshot: snapshot, groceryCommercial: commercialMeta };
    await writeAudit(tx, req, { businessId, userId, action: "grocery.sale.cost_snapshot", entityType: "sales_document", entityId: document.id, after: { valuationMethod: "weighted_average", physicalRotation: "FEFO", totalCogs: snapshot.totalCogs, itemCount: rows.length } });
  } else if (!metadata.groceryCommercial) { await tx.salesDocument.update({ where: { id: document.id }, data: { metadata: { ...metadata, groceryCommercial: commercialMeta } } }); document.metadata = { ...metadata, groceryCommercial: commercialMeta }; }
  const accounting = await postGrocerySaleAccounting(tx, { businessId, userId, document, cogs: num(snapshot.totalCogs) });
  await recordGroceryPromotionUsage(tx, businessId, userId || null, document, promotionEvaluation); const loyalty = await applyGrocerySaleLoyalty(tx, businessId, userId || null, document);
  await writeAudit(tx, req, { businessId, userId, action: "grocery.sale.accounting_posted", entityType: "sales_document", entityId: document.id, after: accounting });
  if (commercialMeta.manualPriceOverrides.length || commercialMeta.manualDiscountOverride) await writeAudit(tx, req, { businessId, userId, action: "grocery.sale.commercial_override", entityType: "sales_document", entityId: document.id, after: { priceOverrides: commercialMeta.manualPriceOverrides, discountOverride: commercialMeta.manualDiscountOverride, reason: text(req.body?.priceOverrideReason || req.body?.discountOverrideReason) || null } });
  if (commercialMeta.promotions.length) await writeAudit(tx, req, { businessId, userId, action: "grocery.sale.promotions_applied", entityType: "sales_document", entityId: document.id, after: { promotions: commercialMeta.promotions, totalDiscount: commercialMeta.promotionDiscount } });
  return { snapshot, accounting, loyalty, commercial: commercialMeta };
}

class GroceryAtomicSaleError extends Error {
  statusCode: number;
  payload: any;
  constructor(statusCode: number, payload: any) {
    super(payload?.error?.message || "Grocery sale failed");
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

export async function groceryCreateSale(req: Request, res: Response) {
  let commercial: any;
  try { commercial = await ensureCommercial(req); }
  catch (error: any) { return res.status(403).json({ ok: false, error: { code: "GROCERY_COMMERCIAL_CONTROL_FAILED", message: error?.message || "Commercial authorization failed" } }); }
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  for (let index = 0; index < items.length; index += 1) { const manual = (commercial.manualPriceOverrides || []).find((x: any) => Number(x.index) === index), authorized = commercial.authorizedPrices?.[index], appliedPrice = manual ? Number(manual.overridePrice) : Number(authorized?.price ?? items[index].unitPrice ?? items[index].rate ?? items[index].price ?? 0); items[index].unitPrice = appliedPrice; items[index].rate = appliedPrice; items[index].price = appliedPrice; }
  let promotionEvaluation: any = null;
  try {
    promotionEvaluation = await evaluateGroceryPromotions(req.tenant?.businessId as string, { items, customerId: req.body?.customerId, customerGroup: req.body?.customerGroup, promoCode: req.body?.promoCode || req.body?.couponCode });
    for (let index = 0; index < items.length; index += 1) { const manual = (commercial.manualPriceOverrides || []).some((x: any) => Number(x.index) === index), promoPrice = promotionEvaluation?.priceOverrides?.[index]; if (!manual && promoPrice !== undefined) { items[index].unitPrice = Number(promoPrice); items[index].rate = Number(promoPrice); items[index].price = Number(promoPrice); } const promoDiscount = Number(promotionEvaluation?.lineDiscounts?.[index] || 0); if (promoDiscount > 0) items[index].discountAmount = round2(Math.max(0, num(items[index].discountAmount ?? items[index].discount)) + promoDiscount); }
    const manualHeader = Math.max(0, num(req.body?.discount ?? req.body?.discountTotal)); req.body.discount = round2(manualHeader + Math.max(0, num(promotionEvaluation?.invoiceDiscount))); (req as any).groceryAutomaticPromotion = promotionEvaluation;
  } catch (error: any) { return res.status(400).json({ ok: false, error: { code: "PROMOTION_EVALUATION_FAILED", message: error?.message || "Promotion evaluation failed" } }); }
  try { await prepareWeightedValuation(req); } catch (error: any) { return res.status(400).json({ ok: false, error: { code: "VALUATION_PREPARATION_FAILED", message: error?.message || "Unable to prepare weighted-average valuation" } }); }

  let statusCode = 200, payload: any = null, posted: any = null;
  const captureResponse: any = { status(code: number) { statusCode = code; return this; }, json(body: any) { payload = body; return this; } };
  try {
    await db.$transaction(async (tx: any) => {
      await createSalesDocument(req, captureResponse as Response);
      if (!payload?.ok || !payload?.data?.id) throw new GroceryAtomicSaleError(statusCode, payload);
      posted = await captureAndPost(tx, req, payload.data.id, promotionEvaluation, commercial);
      if (!posted?.snapshot) throw new Error("Grocery accounting synchronization did not return a cost snapshot");
    });
  } catch (error: any) {
    if (error instanceof GroceryAtomicSaleError) return res.status(error.statusCode).json(error.payload);
    console.error("grocery atomic sale posting error:", error);
    return res.status(400).json({ ok: false, error: { code: "GROCERY_ATOMIC_SALE_FAILED", message: error?.message || "Sale was rolled back because all required postings could not complete" } });
  }

  payload.data.metadata = { ...(payload.data.metadata || {}), groceryCostSnapshot: posted.snapshot, groceryCommercial: posted.commercial };
  payload.data.accounting = posted.accounting || null;
  payload.data.loyalty = posted.loyalty || null;
  payload.data.promotions = promotionEvaluation;
  payload.atomic = true;
  return res.status(statusCode).json(payload);
}
