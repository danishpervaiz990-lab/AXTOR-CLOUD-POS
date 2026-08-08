import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { saveGroceryProductProfileUom, readGroceryProductProfile } from "./grocery-product-uom.controller.js";
import { writeAudit } from "../services/audit.service.js";

const db: any = prisma;
const PRICE_KEYS = ["retailPrice", "wholesalePrice", "memberPrice", "promotionalPrice", "minimumSellingPrice"] as const;
function money(v: unknown) { const n = Number(v || 0); return Math.round((n + Number.EPSILON) * 100) / 100; }

export async function saveGroceryProductProfileWithPriceHistory(req: Request, res: Response) {
  const businessId = req.tenant?.businessId, userId = req.tenant?.userId;
  if (!businessId || !userId) return res.status(401).json({ ok: false, error: { message: "Authenticated Grocery user is required" } });
  const product = await db.product.findFirst({ where: { id: req.params.id, businessId, deleted: false } });
  if (!product) return res.status(404).json({ ok: false, error: { message: "Product not found" } });
  const before = readGroceryProductProfile(product);
  let statusCode = 200, payload: any = null;
  const capture: any = { status(code: number) { statusCode = code; return this; }, json(body: any) { payload = body; return this; } };
  await saveGroceryProductProfileUom(req, capture as Response);
  if (!payload?.ok) return res.status(statusCode).json(payload);
  const updated = await db.product.findFirst({ where: { id: product.id, businessId } });
  const after = readGroceryProductProfile(updated);
  const changed = PRICE_KEYS.filter((key) => money(before[key]) !== money(after[key]));
  if (changed.length) {
    const previous = Object.fromEntries(changed.map((key) => [key, money(before[key])]));
    const next = Object.fromEntries(changed.map((key) => [key, money(after[key])]));
    const reason = String(req.body?.priceChangeReason || req.body?.reason || "").trim() || null;
    const record = await db.industryRecord.create({ data: { businessId, industryCode: "grocery", entityType: "grocery_price_history", referenceNo: `PRICE-${product.id}-${Date.now()}`, displayName: `${product.name} price change`, relatedEntityId: product.id, status: "posted", startAt: new Date(), data: { productId: product.id, sku: product.sku, productName: product.name, previous, next, changedFields: changed, reason }, createdByUserId: userId, updatedByUserId: userId } });
    await writeAudit(db, req, { businessId, userId, action: "grocery.product.price.change", entityType: "Product", entityId: product.id, before: previous, after: { ...next, reason, priceHistoryId: record.id } });
    payload.data = { ...(payload.data || {}), priceHistoryId: record.id };
  }
  return res.status(statusCode).json(payload);
}
