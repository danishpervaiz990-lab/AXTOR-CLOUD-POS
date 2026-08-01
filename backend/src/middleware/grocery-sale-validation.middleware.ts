import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";

const SUPPORTED_UNITS = new Set([
  "piece", "pieces", "pcs", "pc", "pack", "box", "tray", "dozen",
  "kg", "kilogram", "kilograms", "g", "gram", "grams",
  "l", "litre", "liter", "litres", "liters", "ml", "millilitre", "milliliter",
]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isThreeDecimalQuantity(value: number) {
  return Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001;
}

function metadataFor(item: any) {
  const source = item?.scaleBarcode || item?.weightedBarcode || item?.barcodeMetadata || item?.metadata?.scaleBarcode;
  return source && typeof source === "object" && !Array.isArray(source) ? source : null;
}

export async function validateGrocerySale(req: Request, res: Response, next: NextFunction) {
  try {
    const businessId = req.tenant?.businessId;
    if (!businessId) return res.status(401).json({ ok: false, error: { message: "Authentication required" } });

    const selection = await prisma.businessIndustry.findUnique({
      where: { businessId },
      include: { industry: { select: { code: true } } },
    });
    if (String(selection?.industry?.code || "").toLowerCase() !== "grocery") return next();

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return next();

    const productIds = [...new Set(items.map((item: any) => text(item.productId)).filter(Boolean))];
    const products = await prisma.product.findMany({
      where: { businessId, id: { in: productIds }, active: true },
      select: { id: true, name: true, unit: true, customFields: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    for (const item of items) {
      const productId = text(item.productId);
      const product = productById.get(productId);
      if (!product) return res.status(400).json({ ok: false, error: { message: "A Grocery sale item references an invalid or inactive product" } });

      const qty = number(item.qty ?? item.quantity);
      if (!(qty > 0) || !isThreeDecimalQuantity(qty)) {
        return res.status(400).json({ ok: false, error: { message: `${product.name}: quantity must be positive with no more than three decimal places` } });
      }

      const unit = text(item.unit || product.unit).toLowerCase();
      if (unit && !SUPPORTED_UNITS.has(unit)) {
        return res.status(400).json({ ok: false, error: { message: `${product.name}: unsupported Grocery unit ${unit}` } });
      }

      const fields = product.customFields && typeof product.customFields === "object" && !Array.isArray(product.customFields)
        ? product.customFields as Record<string, unknown>
        : {};
      const weighted = Boolean(fields.weighted || fields.isWeighted || fields.weightedItem);
      const scale = metadataFor(item);

      if (scale) {
        const rawBarcode = text(scale.rawBarcode || scale.barcode);
        const mode = text(scale.mode || scale.type).toLowerCase();
        const embeddedValue = number(scale.weight ?? scale.quantity ?? scale.price);
        if (!/^\d{8,14}$/.test(rawBarcode)) {
          return res.status(400).json({ ok: false, error: { message: `${product.name}: invalid scale barcode format` } });
        }
        if (!["weight", "price"].includes(mode)) {
          return res.status(400).json({ ok: false, error: { message: `${product.name}: scale barcode mode must be weight or price` } });
        }
        if (!(embeddedValue > 0)) {
          return res.status(400).json({ ok: false, error: { message: `${product.name}: scale barcode value must be positive` } });
        }
        if (mode === "weight" && Math.abs(embeddedValue - qty) > 0.001) {
          return res.status(400).json({ ok: false, error: { message: `${product.name}: scale barcode weight does not match sale quantity` } });
        }
      } else if (weighted && Number.isInteger(qty) && !["kg", "kilogram", "kilograms", "g", "gram", "grams", "l", "litre", "liter", "litres", "liters", "ml", "millilitre", "milliliter"].includes(unit)) {
        return res.status(400).json({ ok: false, error: { message: `${product.name}: weighted item requires a measured unit or validated scale barcode metadata` } });
      }
    }

    return next();
  } catch (error) {
    console.error("Grocery sale validation failed:", error);
    return res.status(500).json({ ok: false, error: { message: "Unable to validate Grocery sale" } });
  }
}
