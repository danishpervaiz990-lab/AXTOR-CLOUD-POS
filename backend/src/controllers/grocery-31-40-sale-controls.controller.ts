import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";
import { resolveGroceryPrice } from "../services/grocery-31-40-commerce.service.js";

const db: any = prisma;
const text = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const money = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export async function groceryCommercialSaleControls(req: Request, res: Response, next: NextFunction) {
  try {
    const businessId = req.tenant?.businessId, userId = req.tenant?.userId;
    if (!businessId || !userId) return res.status(401).json({ ok: false, error: { code: "USER_CONTEXT_REQUIRED", message: "Authenticated Grocery user is required" } });
    const access = await loadUserAccess(db, businessId, userId), items = Array.isArray(req.body?.items) ? req.body.items : [];
    const customerId = text(req.body?.customerId) || null, priceLevel = text(req.body?.priceLevel || "retail").toLowerCase();
    const commercial: any = { priceLevel, customerId, authorizedPrices: [], manualPriceOverrides: [], manualDiscountOverride: false };

    const headerDiscount = Math.max(0, num(req.body?.discount ?? req.body?.discountTotal));
    const hasLineDiscount = items.some((item: any) => Math.max(0, num(item.discountAmount ?? item.discount)) > 0);
    if ((headerDiscount > 0 || hasLineDiscount) && !hasPermission(access, "discounts.override")) {
      return res.status(403).json({ ok: false, error: { code: "DISCOUNT_OVERRIDE_DENIED", message: "Manual discount requires discounts.override permission" } });
    }
    commercial.manualDiscountOverride = headerDiscount > 0 || hasLineDiscount;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index], productId = text(item.productId);
      if (!productId) continue;
      const resolved = await resolveGroceryPrice(businessId, { productId, customerId, priceLevel });
      const suppliedRaw = item.unitPrice ?? item.rate ?? item.price;
      const supplied = suppliedRaw === undefined || suppliedRaw === null || suppliedRaw === "" ? resolved.price : money(num(suppliedRaw, resolved.price));
      const manual = Math.abs(supplied - Number(resolved.price)) > 0.001;
      if (manual && !hasPermission(access, "pricing.manual_override")) {
        return res.status(403).json({ ok: false, error: { code: "PRICE_OVERRIDE_DENIED", message: `${resolved.productName}: manual price ${supplied.toFixed(2)} differs from authorized ${resolved.source} price ${Number(resolved.price).toFixed(2)}` } });
      }
      commercial.authorizedPrices[index] = { productId, price: Number(resolved.price), source: resolved.source };
      if (manual) commercial.manualPriceOverrides.push({ index, productId, authorizedPrice: Number(resolved.price), overridePrice: supplied, reason: text(req.body?.priceOverrideReason || item.priceOverrideReason) || null });
      const product = await db.product.findFirst({ where: { id: productId, businessId }, select: { price: true } });
      const guardPrice = Number(product?.price || resolved.retailPrice || resolved.price);
      item.unitPrice = guardPrice; item.rate = guardPrice; item.price = guardPrice;
    }
    (req as any).groceryCommercial = commercial;
    next();
  } catch (error: any) {
    return res.status(400).json({ ok: false, error: { code: "GROCERY_COMMERCIAL_CONTROL_FAILED", message: error?.message || "Unable to validate Grocery commercial controls" } });
  }
}
