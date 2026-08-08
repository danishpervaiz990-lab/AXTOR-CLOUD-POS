import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hasPermission, loadUserAccess } from "../services/access.service.js";
import { resolveGroceryPrice } from "../services/grocery-31-40-commerce.service.js";

export const GROCERY_SUPPORTED_UNITS = new Set(["piece","pieces","pcs","pc","pack","box","tray","dozen","kg","kilogram","kilograms","g","gram","grams","l","litre","liter","litres","liters","ml","millilitre","milliliter"]);
function text(value: unknown) { return String(value ?? "").trim(); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : NaN; }
export function isThreeDecimalQuantity(value: number) { return Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001; }
export function groceryScaleMetadata(item: any) { const source = item?.scaleBarcode || item?.weightedBarcode || item?.barcodeMetadata || item?.metadata?.scaleBarcode; return source && typeof source === "object" && !Array.isArray(source) ? source : null; }
export function validateScaleMetadata(scale: any, qty: number): string | null { const rawBarcode = text(scale?.rawBarcode || scale?.barcode), mode = text(scale?.mode || scale?.type).toLowerCase(), embeddedValue = number(scale?.weight ?? scale?.quantity ?? scale?.price); if (!/^\d{8,14}$/.test(rawBarcode)) return "invalid scale barcode format"; if (!["weight","price"].includes(mode)) return "scale barcode mode must be weight or price"; if (!(embeddedValue > 0)) return "scale barcode value must be positive"; if (mode === "weight" && Math.abs(embeddedValue - qty) > .001) return "scale barcode weight does not match sale quantity"; return null; }

export async function validateGrocerySale(req: Request, res: Response, next: NextFunction) {
  try {
    const businessId = req.tenant?.businessId, userId = req.tenant?.userId; if (!businessId) return res.status(401).json({ ok: false, error: { message: "Authentication required" } });
    const selection = await prisma.businessIndustry.findUnique({ where: { businessId }, include: { industry: { select: { code: true } } } }); if (String(selection?.industry?.code || "").toLowerCase() !== "grocery") return next();
    const body = req.body && typeof req.body === "object" ? req.body : {}, items = Array.isArray(body.items) ? body.items : []; if (!items.length) return next();
    const access = await loadUserAccess(prisma as any, businessId, userId), customerId = text(body.customerId) || null, priceLevel = text(body.priceLevel || "retail").toLowerCase();
    const headerDiscount = Math.max(0, Number(body.discount ?? body.discountTotal ?? 0));
    const lineDiscount = items.some((item: any) => Number(item.discountAmount ?? item.discount ?? 0) > 0);
    if ((headerDiscount > 0 || lineDiscount) && !(req as any).groceryAutomaticPromotion && !hasPermission(access, "discounts.override")) return res.status(403).json({ ok: false, error: { code: "DISCOUNT_OVERRIDE_DENIED", message: "Manual discount requires discounts.override permission" } });

    const productIds: string[] = [...new Set<string>(items.map((item: any) => text(item.productId)).filter(Boolean))];
    const products = await prisma.product.findMany({ where: { businessId, id: { in: productIds }, active: true }, select: { id: true, name: true, unit: true, customFields: true } });
    const productById = new Map(products.map((product) => [product.id, product]));
    for (const item of items) {
      const productId = text(item.productId), product = productById.get(productId); if (!product) return res.status(400).json({ ok: false, error: { message: "A Grocery sale item references an invalid or inactive product" } });
      const saleQty = number(item.qty ?? item.quantity); if (!(saleQty > 0) || !isThreeDecimalQuantity(saleQty)) return res.status(400).json({ ok: false, error: { message: `${product.name}: quantity must be positive with no more than three decimal places` } });
      const unit = text(item.unit || product.unit).toLowerCase(); if (unit && !GROCERY_SUPPORTED_UNITS.has(unit)) return res.status(400).json({ ok: false, error: { message: `${product.name}: unsupported Grocery unit ${unit}` } });
      const fields = product.customFields && typeof product.customFields === "object" && !Array.isArray(product.customFields) ? product.customFields as Record<string, unknown> : {}, weighted = Boolean(fields.weighted || fields.isWeighted || fields.weightedItem), scale = groceryScaleMetadata(item);
      if (scale) { const error = validateScaleMetadata(scale, saleQty); if (error) return res.status(400).json({ ok: false, error: { message: `${product.name}: ${error}` } }); }
      else if (weighted && Number.isInteger(saleQty) && !["kg","kilogram","kilograms","g","gram","grams","l","litre","liter","litres","liters","ml","millilitre","milliliter"].includes(unit)) return res.status(400).json({ ok: false, error: { message: `${product.name}: weighted item requires a measured unit or validated scale barcode metadata` } });

      if (!(req as any).groceryAutomaticPromotion) {
        const authorized = await resolveGroceryPrice(businessId, { productId, customerId, priceLevel }), suppliedRaw = item.unitPrice ?? item.rate ?? item.price, supplied = suppliedRaw === undefined || suppliedRaw === null || suppliedRaw === "" ? Number(authorized.price) : Number(suppliedRaw);
        if (!Number.isFinite(supplied) || supplied < 0) return res.status(422).json({ ok: false, error: { code: "INVALID_PRICE", message: `${product.name}: invalid selling price` } });
        if (Math.abs(supplied - Number(authorized.price)) > .001 && !hasPermission(access, "pricing.manual_override")) return res.status(403).json({ ok: false, error: { code: "PRICE_OVERRIDE_DENIED", message: `${product.name}: manual price differs from authorized ${authorized.source} price` } });
        item.unitPrice = supplied; item.rate = supplied; item.price = supplied;
      }
    }
    return next();
  } catch (error) { console.error("Grocery sale validation failed:", error); return res.status(500).json({ ok: false, error: { message: "Unable to validate Grocery sale" } }); }
}
