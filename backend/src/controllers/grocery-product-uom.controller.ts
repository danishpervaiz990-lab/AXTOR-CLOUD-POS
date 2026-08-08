import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";

const db: any = prisma;
function text(v: unknown) { return String(v ?? "").trim(); }
function num(v: unknown, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function round3(v: number) { return Math.round((v + Number.EPSILON) * 1000) / 1000; }
function json(v: unknown): Record<string, any> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {}; }
function bool(v: unknown, f = false) { if (v === undefined || v === null || v === "") return f; if (typeof v === "boolean") return v; return ["1", "true", "yes", "on"].includes(String(v).toLowerCase()); }
function tenant(req: Request) { const businessId = req.tenant?.businessId; const userId = req.tenant?.userId; if (!businessId || !userId) throw new Error("Authenticated Grocery tenant is required"); return { businessId, userId }; }
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok: true, data }); }
function fail(res: Response, e: any, status = 400) { return res.status(status).json({ ok: false, error: { message: e?.message || "Request failed" } }); }

export type GroceryUom = { unit: string; multiplier: number; price?: number | null };
export type GroceryProductProfile = {
  barcodes: string[];
  plu: string | null;
  weightedBarcode: boolean;
  weightedBarcodePrefix: string | null;
  priceEmbeddedBarcode: boolean;
  priceEmbeddedBarcodePrefix: string | null;
  baseUnit: string;
  uoms: GroceryUom[];
  retailPrice: number;
  wholesalePrice: number;
  memberPrice: number;
  promotionalPrice: number;
  minimumSellingPrice: number;
  maxStock: number;
  reorderLevel: number;
  reorderQuantity: number;
  margin: number;
  markup: number;
  expiryTracking: boolean;
  batchTracking: boolean;
};

function normalizedUoms(value: unknown, baseUnit: string): GroceryUom[] {
  const rows = Array.isArray(value) ? value : [];
  const map = new Map<string, GroceryUom>();
  map.set(baseUnit, { unit: baseUnit, multiplier: 1 });
  for (const raw of rows) {
    const x = json(raw);
    const unit = text(x.unit || x.uom).toUpperCase();
    if (!unit) continue;
    const multiplier = round3(Math.max(0.0001, num(x.multiplier ?? x.factor, 1)));
    map.set(unit, { unit, multiplier, ...(x.price !== undefined && x.price !== null ? { price: Math.max(0, num(x.price)) } : {}) });
  }
  map.set(baseUnit, { ...(map.get(baseUnit) || {}), unit: baseUnit, multiplier: 1 });
  return [...map.values()];
}

export function readGroceryProductProfile(product: any): GroceryProductProfile {
  const cf = json(product?.customFields); const g = json(cf.grocery);
  const baseUnit = text(g.baseUnit || product?.unit || "PCS").toUpperCase() || "PCS";
  const barcodeSource = Array.isArray(g.barcodes) ? g.barcodes : Array.isArray(cf.barcodes) ? cf.barcodes : [];
  const uomSource = Array.isArray(g.uoms) && g.uoms.length ? g.uoms : Array.isArray(cf.uomConversions) ? cf.uomConversions : [];
  return {
    barcodes: [...new Set<string>(barcodeSource.map(text).filter(Boolean))],
    plu: text(g.plu || cf.plu) || null,
    weightedBarcode: bool(g.weightedBarcode, bool(cf.weightedBarcode, bool(cf.weightedProduct))),
    weightedBarcodePrefix: text(g.weightedBarcodePrefix || cf.weightedBarcodePrefix) || null,
    priceEmbeddedBarcode: bool(g.priceEmbeddedBarcode, bool(cf.priceEmbeddedBarcode)),
    priceEmbeddedBarcodePrefix: text(g.priceEmbeddedBarcodePrefix || cf.priceEmbeddedBarcodePrefix) || null,
    baseUnit,
    uoms: normalizedUoms(uomSource, baseUnit),
    retailPrice: Math.max(0, num(g.retailPrice, num(product?.price))),
    wholesalePrice: Math.max(0, num(g.wholesalePrice)),
    memberPrice: Math.max(0, num(g.memberPrice)),
    promotionalPrice: Math.max(0, num(g.promotionalPrice)),
    minimumSellingPrice: Math.max(0, num(g.minimumSellingPrice)),
    maxStock: Math.max(0, num(g.maxStock)),
    reorderLevel: Math.max(0, num(g.reorderLevel, num(product?.minStock))),
    reorderQuantity: Math.max(0, num(g.reorderQuantity)),
    margin: num(g.margin), markup: num(g.markup),
    expiryTracking: bool(g.expiryTracking, bool(cf.expiryTracking)),
    batchTracking: bool(g.batchTracking, bool(cf.batchTracking)),
  };
}

export function resolveGroceryUom(product: any, requestedUnit: unknown) {
  const profile = readGroceryProductProfile(product);
  const requested = text(requestedUnit || profile.baseUnit).toUpperCase() || profile.baseUnit;
  const row = profile.uoms.find(x => x.unit === requested);
  if (!row) throw new Error(`${product.name}: UOM ${requested} is not configured`);
  return { profile, unit: row.unit, multiplier: row.multiplier, price: row.price ?? null };
}

function validatePrefix(value: unknown, label: string) {
  const prefix = text(value);
  if (!prefix) return null;
  if (!/^\d{2,8}$/.test(prefix)) throw new Error(`${label} must contain 2–8 digits`);
  return prefix;
}

async function assertUniqueIdentifiers(businessId: string, productId: string, primaryBarcode: string | null, profile: GroceryProductProfile) {
  const candidates = new Set<string>([primaryBarcode || "", ...profile.barcodes].map(text).filter(Boolean));
  const plu = text(profile.plu).toLowerCase();
  const others = await db.product.findMany({ where: { businessId, id: { not: productId }, deleted: false, active: true }, select: { id: true, name: true, barcode: true, customFields: true, unit: true, price: true, minStock: true } });
  for (const other of others) {
    if (other.barcode && candidates.has(String(other.barcode))) throw new Error(`Barcode ${other.barcode} already belongs to ${other.name}`);
    const op = readGroceryProductProfile(other);
    const clash = op.barcodes.find(b => candidates.has(b));
    if (clash) throw new Error(`Barcode ${clash} already belongs to ${other.name}`);
    if (plu && text(op.plu).toLowerCase() === plu) throw new Error(`PLU ${profile.plu} already belongs to ${other.name}`);
    if (profile.weightedBarcodePrefix && op.weightedBarcode && op.weightedBarcodePrefix === profile.weightedBarcodePrefix) throw new Error(`Weighted barcode prefix ${profile.weightedBarcodePrefix} already belongs to ${other.name}`);
    if (profile.priceEmbeddedBarcodePrefix && op.priceEmbeddedBarcode && op.priceEmbeddedBarcodePrefix === profile.priceEmbeddedBarcodePrefix) throw new Error(`Price-embedded barcode prefix ${profile.priceEmbeddedBarcodePrefix} already belongs to ${other.name}`);
  }
}

export async function groceryProductProfileUom(req: Request, res: Response) {
  try { const t = tenant(req); const product = await db.product.findFirst({ where: { id: req.params.id, businessId: t.businessId, deleted: false } }); if (!product) return fail(res, new Error("Product not found"), 404); return ok(res, { product, grocery: readGroceryProductProfile(product) }); } catch (e) { return fail(res, e); }
}

export async function saveGroceryProductProfileUom(req: Request, res: Response) {
  try {
    const t = tenant(req); const product = await db.product.findFirst({ where: { id: req.params.id, businessId: t.businessId, deleted: false } }); if (!product) return fail(res, new Error("Product not found"), 404);
    const before = readGroceryProductProfile(product); const input = req.body || {};
    const baseUnit = text(input.baseUnit || before.baseUnit).toUpperCase() || before.baseUnit;
    const profile: GroceryProductProfile = {
      ...before,
      ...(input.barcodes !== undefined ? { barcodes: [...new Set<string>((Array.isArray(input.barcodes) ? input.barcodes : []).map(text).filter(Boolean))] } : {}),
      ...(input.plu !== undefined ? { plu: text(input.plu) || null } : {}),
      ...(input.weightedBarcode !== undefined ? { weightedBarcode: bool(input.weightedBarcode) } : {}),
      ...(input.priceEmbeddedBarcode !== undefined ? { priceEmbeddedBarcode: bool(input.priceEmbeddedBarcode) } : {}),
      ...(input.weightedBarcodePrefix !== undefined ? { weightedBarcodePrefix: validatePrefix(input.weightedBarcodePrefix, "Weighted barcode prefix") } : {}),
      ...(input.priceEmbeddedBarcodePrefix !== undefined ? { priceEmbeddedBarcodePrefix: validatePrefix(input.priceEmbeddedBarcodePrefix, "Price-embedded barcode prefix") } : {}),
      baseUnit,
      uoms: normalizedUoms(input.uoms !== undefined ? input.uoms : before.uoms, baseUnit),
      ...(input.retailPrice !== undefined ? { retailPrice: Math.max(0, num(input.retailPrice)) } : {}),
      ...(input.wholesalePrice !== undefined ? { wholesalePrice: Math.max(0, num(input.wholesalePrice)) } : {}),
      ...(input.memberPrice !== undefined ? { memberPrice: Math.max(0, num(input.memberPrice)) } : {}),
      ...(input.promotionalPrice !== undefined ? { promotionalPrice: Math.max(0, num(input.promotionalPrice)) } : {}),
      ...(input.minimumSellingPrice !== undefined ? { minimumSellingPrice: Math.max(0, num(input.minimumSellingPrice)) } : {}),
      ...(input.maxStock !== undefined ? { maxStock: Math.max(0, num(input.maxStock)) } : {}),
      ...(input.reorderLevel !== undefined ? { reorderLevel: Math.max(0, num(input.reorderLevel)) } : {}),
      ...(input.reorderQuantity !== undefined ? { reorderQuantity: Math.max(0, num(input.reorderQuantity)) } : {}),
      ...(input.margin !== undefined ? { margin: num(input.margin) } : {}),
      ...(input.markup !== undefined ? { markup: num(input.markup) } : {}),
      ...(input.expiryTracking !== undefined ? { expiryTracking: bool(input.expiryTracking) } : {}),
      ...(input.batchTracking !== undefined ? { batchTracking: bool(input.batchTracking) } : {}),
    };
    if (profile.weightedBarcode && !profile.weightedBarcodePrefix) throw new Error("Weighted barcode prefix is required when weighted barcode is enabled");
    if (profile.priceEmbeddedBarcode && !profile.priceEmbeddedBarcodePrefix) throw new Error("Price-embedded barcode prefix is required when price-embedded barcode is enabled");
    await assertUniqueIdentifiers(t.businessId, product.id, product.barcode, profile);
    const cf = json(product.customFields);
    const customFields = {
      ...cf,
      grocery: profile,
      plu: profile.plu,
      barcodes: profile.barcodes,
      uomConversions: profile.uoms.filter(x => x.unit !== profile.baseUnit).map(x => ({ unit: x.unit, factor: x.multiplier, multiplier: x.multiplier, ...(x.price != null ? { price: x.price } : {}) })),
      weightedBarcode: profile.weightedBarcode,
      weightedProduct: profile.weightedBarcode,
      weightedBarcodePrefix: profile.weightedBarcodePrefix,
      priceEmbeddedBarcode: profile.priceEmbeddedBarcode,
      priceEmbeddedBarcodePrefix: profile.priceEmbeddedBarcodePrefix,
      expiryTracking: profile.expiryTracking,
      batchTracking: profile.batchTracking,
    };
    const updated = await db.product.update({ where: { id: product.id }, data: { unit: profile.baseUnit, price: profile.retailPrice, minStock: profile.reorderLevel, customFields } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.product.uom_profile.update", entityType: "Product", entityId: product.id, before, after: profile });
    return ok(res, { product: updated, grocery: profile });
  } catch (e) { return fail(res, e); }
}

function decodeEmbeddedBarcode(product: any, query: string) {
  const profile = readGroceryProductProfile(product);
  const rules = [
    profile.priceEmbeddedBarcode && profile.priceEmbeddedBarcodePrefix ? { type: "price", prefix: profile.priceEmbeddedBarcodePrefix } : null,
    profile.weightedBarcode && profile.weightedBarcodePrefix ? { type: "weight", prefix: profile.weightedBarcodePrefix } : null,
  ].filter(Boolean) as { type: "price" | "weight"; prefix: string }[];
  for (const rule of rules) {
    if (!query.startsWith(rule.prefix) || query.length < rule.prefix.length + 5) continue;
    const raw = Number(query.slice(rule.prefix.length, rule.prefix.length + 5));
    if (!Number.isFinite(raw)) continue;
    return rule.type === "price" ? { price: raw / 100, qty: 1, barcodeType: "price_embedded" } : { qty: raw / 1000, barcodeType: "weighted" };
  }
  return null;
}

export async function groceryProductLookupUom(req: Request, res: Response) {
  try {
    const t = tenant(req); const q = text(req.query.q || req.query.code); if (!q) throw new Error("Lookup code is required");
    let product = await db.product.findFirst({ where: { businessId: t.businessId, deleted: false, active: true, OR: [{ sku: { equals: q, mode: "insensitive" } }, { barcode: { equals: q, mode: "insensitive" } }, { itemCode: { equals: q, mode: "insensitive" } }, { productCode: { equals: q, mode: "insensitive" } }] } });
    let embedded: any = null;
    if (!product) {
      const products = await db.product.findMany({ where: { businessId: t.businessId, deleted: false, active: true }, take: 10000 });
      const lower = q.toLowerCase();
      product = products.find((p: any) => { const gp = readGroceryProductProfile(p); return text(gp.plu).toLowerCase() === lower || gp.barcodes.some(b => b.toLowerCase() === lower); }) || null;
      if (!product && /^\d{7,18}$/.test(q)) {
        for (const candidate of products) { const decoded = decodeEmbeddedBarcode(candidate, q); if (decoded) { product = candidate; embedded = decoded; break; } }
      }
    }
    if (!product) return fail(res, new Error("Product not found"), 404);
    return ok(res, { product, grocery: readGroceryProductProfile(product), embedded });
  } catch (e) { return fail(res, e); }
}
