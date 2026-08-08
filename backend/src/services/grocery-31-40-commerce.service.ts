import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "./audit.service.js";
import { ApiError, roundMoney } from "../utils/http.js";
import { readGroceryProductProfile } from "../controllers/grocery-product-uom.controller.js";

const db: any = prisma;
const money = (v: unknown) => roundMoney(Number(v || 0));
const qty = (v: unknown) => Math.round((Number(v || 0) + Number.EPSILON) * 1000) / 1000;
const text = (v: unknown) => String(v ?? "").trim();
const json = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const bool = (v: unknown, fallback = false) => v === undefined ? fallback : [true, 1, "1", "true", "yes", "on"].includes(v as any);

export const GROCERY_PROMOTION_TYPES = [
  "fixed_discount", "percentage_discount", "product_discount", "category_discount", "customer_specific_price", "member_price",
  "scheduled_promotion", "buy_x_get_y", "buy_one_get_one", "quantity_break", "bundle_pricing", "mix_and_match", "coupon",
] as const;

function promotionType(value: unknown) {
  const raw = text(value).toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = { flat: "fixed_discount", fixed: "fixed_discount", percent: "percentage_discount", percentage: "percentage_discount", bogo: "buy_one_get_one", bxgy: "buy_x_get_y", bundle: "bundle_pricing", mixmatch: "mix_and_match", promo_code: "coupon" };
  const type = aliases[raw] || raw;
  if (!(GROCERY_PROMOTION_TYPES as readonly string[]).includes(type)) throw new ApiError(400, `Unsupported Grocery promotion type: ${raw || "blank"}`);
  return type;
}

function scope(input: any) {
  const s = json(input?.scope);
  const arr = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(text).filter(Boolean))].slice(0, 1000);
  const tiers = s.tiers ?? input?.tiers;
  return {
    ...s,
    productIds: arr(s.productIds ?? input?.productIds), categories: arr(s.categories ?? input?.categories),
    customerIds: arr(s.customerIds ?? input?.customerIds), customerGroups: arr(s.customerGroups ?? input?.customerGroups),
    buyProductIds: arr(s.buyProductIds ?? input?.buyProductIds), getProductIds: arr(s.getProductIds ?? input?.getProductIds),
    bundleProductIds: arr(s.bundleProductIds ?? input?.bundleProductIds), mixProductIds: arr(s.mixProductIds ?? input?.mixProductIds),
    minimumQuantity: Math.max(0, Number(s.minimumQuantity ?? input?.minimumQuantity ?? 0)),
    minimumInvoiceAmount: Math.max(0, Number(s.minimumInvoiceAmount ?? input?.minimumInvoiceAmount ?? 0)),
    maximumDiscount: Math.max(0, Number(s.maximumDiscount ?? input?.maximumDiscount ?? 0)),
    usageLimit: Math.max(0, Math.trunc(Number(s.usageLimit ?? input?.usageLimit ?? 0))),
    perCustomerUsageLimit: Math.max(0, Math.trunc(Number(s.perCustomerUsageLimit ?? input?.perCustomerUsageLimit ?? 0))),
    buyQuantity: Math.max(1, Number(s.buyQuantity ?? input?.buyQuantity ?? 1)), getQuantity: Math.max(1, Number(s.getQuantity ?? input?.getQuantity ?? 1)),
    bundlePrice: Math.max(0, Number(s.bundlePrice ?? input?.bundlePrice ?? 0)), mixPrice: Math.max(0, Number(s.mixPrice ?? input?.mixPrice ?? 0)),
    discountMode: text((s.discountMode ?? input?.discountMode) || "percentage").toLowerCase(),
    allowStacking: bool(s.allowStacking ?? input?.allowStacking, false), priority: Number(s.priority ?? input?.priority ?? 100),
    tiers: Array.isArray(tiers) ? tiers.slice(0, 50) : [],
  };
}

export async function listGroceryPromotions(businessId: string, query: any = {}) {
  const where: any = { businessId };
  if (query.active !== undefined) where.active = ["1", "true", "yes"].includes(String(query.active).toLowerCase());
  const rows = await db.promotion.findMany({ where, orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
  return rows.map((r: any) => ({ ...r, value: Number(r.value || 0), scope: scope({ scope: r.scope }) }));
}

export async function saveGroceryPromotion(req: Request, businessId: string, userId: string, id: string | null, input: any) {
  const name = text(input?.name); if (!name) throw new ApiError(400, "Promotion name is required");
  const type = promotionType(input?.type), value = money(input?.value), code = text(input?.code).toUpperCase() || null, normalized = scope(input);
  const startsAt = input?.startsAt || input?.startDate ? new Date(String(input.startsAt || input.startDate)) : null;
  const endsAt = input?.endsAt || input?.endDate ? new Date(String(input.endsAt || input.endDate)) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new ApiError(400, "Invalid promotion start date");
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new ApiError(400, "Invalid promotion end date");
  if (startsAt && endsAt && startsAt > endsAt) throw new ApiError(400, "Promotion start date cannot be after end date");
  return db.$transaction(async (tx: any) => {
    const before = id ? await tx.promotion.findFirst({ where: { id, businessId } }) : null;
    if (id && !before) throw new ApiError(404, "Promotion not found");
    if (code && await tx.promotion.findFirst({ where: { businessId, code, ...(id ? { id: { not: id } } : {}) } })) throw new ApiError(409, "Promotion code already exists");
    const data = { name, type, value, valueText: text(input?.valueText) || null, code, scope: normalized, startsAt, endsAt, active: input?.active === undefined ? true : bool(input.active) };
    const row = id ? await tx.promotion.update({ where: { id }, data }) : await tx.promotion.create({ data: { businessId, ...data } });
    await writeAudit(tx, req, { businessId, userId, action: id ? "grocery.promotion.update" : "grocery.promotion.create", entityType: "Promotion", entityId: row.id, before: before || undefined, after: row });
    return row;
  });
}

export async function removeGroceryPromotion(req: Request, businessId: string, userId: string, id: string) {
  return db.$transaction(async (tx: any) => {
    const before = await tx.promotion.findFirst({ where: { id, businessId } }); if (!before) throw new ApiError(404, "Promotion not found");
    const row = await tx.promotion.update({ where: { id }, data: { active: false } });
    await writeAudit(tx, req, { businessId, userId, action: "grocery.promotion.deactivate", entityType: "Promotion", entityId: id, before, after: row }); return row;
  });
}

type CartLine = { index: number; productId: string; category: string; qty: number; unitPrice: number; lineAmount: number; product: any };
async function cartContext(businessId: string, input: any) {
  const raw = Array.isArray(input?.items) ? input.items : []; if (!raw.length) throw new ApiError(400, "Promotion evaluation requires cart items");
  const ids = [...new Set(raw.map((x: any) => text(x.productId)).filter(Boolean))];
  const products = await db.product.findMany({ where: { businessId, id: { in: ids }, active: true, deleted: false } });
  const byId = new Map<string, any>(products.map((p: any) => [String(p.id), p]));
  const lines: CartLine[] = raw.map((x: any, index: number) => { const p = byId.get(text(x.productId)); if (!p) throw new ApiError(400, "Promotion cart contains an invalid product"); const q = qty(x.qty ?? x.quantity); if (q <= 0) throw new ApiError(400, `Invalid quantity for ${p.name}`); const price = money(x.unitPrice ?? x.rate ?? x.price ?? p.price); return { index, productId: p.id, category: p.category || "", qty: q, unitPrice: price, lineAmount: money(q * price), product: p }; });
  const customerId = text(input?.customerId) || null;
  const customer = customerId ? await db.customer.findFirst({ where: { id: customerId, businessId, active: true } }) : null;
  const loyalty = customerId ? await db.loyaltyAccount.findFirst({ where: { businessId, customerId } }) : null;
  const cf = json(customer?.customFields || customer?.metadata);
  return { lines, customer, loyalty, customerGroup: text(input?.customerGroup || cf.group || cf.customerGroup || (loyalty ? "member" : "")), subtotal: money(lines.reduce((s, l) => s + l.lineAmount, 0)) };
}
function matches(s: any, l: CartLine) { return !(s.productIds?.length && !s.productIds.includes(String(l.productId))) && !(s.categories?.length && !s.categories.map((x: string) => x.toLowerCase()).includes(String(l.category).toLowerCase())); }
async function usageAllowed(businessId: string, promotion: any, customerId: string | null, s: any) {
  if (!s.usageLimit && !s.perCustomerUsageLimit) return true;
  const rows = await db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_promotion_usage", relatedEntityId: promotion.id, archivedAt: null }, select: { data: true } });
  if (s.usageLimit && rows.length >= s.usageLimit) return false;
  if (s.perCustomerUsageLimit && customerId && rows.filter((r: any) => text(json(r.data).customerId) === customerId).length >= s.perCustomerUsageLimit) return false;
  return true;
}
function capped(v: number, s: any) { return money(Math.max(0, s.maximumDiscount > 0 ? Math.min(v, s.maximumDiscount) : v)); }
function calculatePromotion(p: any, s: any, ctx: any) {
  const type = promotionType(p.type), eligible: CartLine[] = ctx.lines.filter((l: CartLine) => matches(s, l));
  const eligibleQty = eligible.reduce((n, l) => n + l.qty, 0);
  if (s.minimumInvoiceAmount && ctx.subtotal + .001 < s.minimumInvoiceAmount) return null;
  if (s.minimumQuantity && eligibleQty + .001 < s.minimumQuantity) return null;
  if (s.customerIds?.length && (!ctx.customer || !s.customerIds.includes(String(ctx.customer.id)))) return null;
  if (s.customerGroups?.length && !s.customerGroups.map((x: string) => x.toLowerCase()).includes(String(ctx.customerGroup).toLowerCase())) return null;
  const value = Number(p.value || 0), lineDiscounts: Record<number, number> = {}, priceOverrides: Record<number, number> = {}; let invoiceDiscount = 0;
  if (["fixed_discount", "scheduled_promotion", "coupon"].includes(type)) invoiceDiscount = value;
  else if (type === "percentage_discount") invoiceDiscount = ctx.subtotal * value / 100;
  else if (["product_discount", "category_discount"].includes(type)) for (const l of eligible) lineDiscounts[l.index] = money(s.discountMode === "fixed" ? Math.min(l.lineAmount, value) : l.lineAmount * value / 100);
  else if (type === "member_price") { if (!ctx.loyalty) return null; for (const l of eligible) { const gp = readGroceryProductProfile(l.product); if (gp.memberPrice > 0 && gp.memberPrice < l.unitPrice) priceOverrides[l.index] = gp.memberPrice; } }
  else if (type === "customer_specific_price") { if (!ctx.customer) return null; }
  else if (["buy_one_get_one", "buy_x_get_y"].includes(type)) {
    const buyIds = s.buyProductIds?.length ? s.buyProductIds : s.productIds, getIds = s.getProductIds?.length ? s.getProductIds : buyIds;
    const buys = ctx.lines.filter((l: CartLine) => !buyIds?.length || buyIds.includes(String(l.productId))), gets = ctx.lines.filter((l: CartLine) => !getIds?.length || getIds.includes(String(l.productId))).sort((a: CartLine, b: CartLine) => a.unitPrice - b.unitPrice);
    const bq = type === "buy_one_get_one" ? 1 : s.buyQuantity, gq = type === "buy_one_get_one" ? 1 : s.getQuantity; let free = Math.floor(buys.reduce((n: number, l: CartLine) => n + l.qty, 0) / bq) * gq;
    for (const l of gets) { if (free <= 0) break; const n = Math.min(free, l.qty); lineDiscounts[l.index] = money((lineDiscounts[l.index] || 0) + n * l.unitPrice); free -= n; }
  } else if (type === "quantity_break") {
    const tiers = s.tiers.map((t: any) => ({ minQty: Number(t.minQty || t.quantity || 0), price: Number(t.price || 0), discountPercent: Number(t.discountPercent || 0) })).filter((t: any) => t.minQty > 0).sort((a: any, b: any) => b.minQty - a.minQty);
    for (const l of eligible) { const t = tiers.find((x: any) => l.qty >= x.minQty); if (!t) continue; if (t.price > 0 && t.price < l.unitPrice) priceOverrides[l.index] = money(t.price); else if (t.discountPercent > 0) lineDiscounts[l.index] = money(l.lineAmount * t.discountPercent / 100); }
  } else if (["bundle_pricing", "mix_and_match"].includes(type)) {
    const ids = type === "bundle_pricing" ? s.bundleProductIds : s.mixProductIds; if (!ids?.length || !ids.every((id: string) => ctx.lines.some((l: CartLine) => String(l.productId) === id))) return null;
    const raw = ctx.lines.filter((l: CartLine) => ids.includes(String(l.productId))).reduce((n: number, l: CartLine) => n + l.lineAmount, 0), target = Number(type === "bundle_pricing" ? s.bundlePrice : s.mixPrice); if (target > 0 && raw > target) invoiceDiscount = raw - target;
  }
  let total = invoiceDiscount + Object.values(lineDiscounts).reduce((n, v) => n + Number(v), 0);
  for (const [k, v] of Object.entries(priceOverrides)) { const l = ctx.lines[Number(k)]; if (l) total += Math.max(0, (l.unitPrice - Number(v)) * l.qty); }
  total = capped(total, s); if (total <= 0) return null;
  return { promotionId: p.id, name: p.name, code: p.code || null, type, priority: s.priority, allowStacking: s.allowStacking, invoiceDiscount: money(invoiceDiscount), lineDiscounts, priceOverrides, totalDiscount: total };
}

export async function evaluateGroceryPromotions(businessId: string, input: any) {
  const ctx = await cartContext(businessId, input), now = new Date(), code = text(input?.promoCode || input?.couponCode).toUpperCase();
  const promotions = await db.promotion.findMany({ where: { businessId, active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] }, orderBy: { createdAt: "asc" } });
  const candidates: any[] = [];
  for (const p of promotions) { if (p.code && code !== String(p.code).toUpperCase()) continue; const s = scope({ scope: p.scope }); if (!await usageAllowed(businessId, p, ctx.customer?.id || null, s)) continue; const c = calculatePromotion(p, s, ctx); if (c) candidates.push(c); }
  candidates.sort((a, b) => a.priority - b.priority || b.totalDiscount - a.totalDiscount); const applied: any[] = [];
  for (const c of candidates) { if (!applied.length) applied.push(c); else if (c.allowStacking && applied.every((x) => x.allowStacking)) applied.push(c); }
  const lineDiscounts: Record<number, number> = {}, priceOverrides: Record<number, number> = {}; let invoiceDiscount = 0;
  for (const p of applied) { invoiceDiscount += Number(p.invoiceDiscount || 0); for (const [k, v] of Object.entries(p.lineDiscounts || {})) lineDiscounts[Number(k)] = money((lineDiscounts[Number(k)] || 0) + Number(v)); for (const [k, v] of Object.entries(p.priceOverrides || {})) priceOverrides[Number(k)] = Math.min(priceOverrides[Number(k)] ?? Number.MAX_SAFE_INTEGER, Number(v)); }
  return { subtotal: ctx.subtotal, customerId: ctx.customer?.id || null, customerGroup: ctx.customerGroup || null, appliedPromotions: applied, invoiceDiscount: money(invoiceDiscount), lineDiscounts, priceOverrides, totalDiscount: money(applied.reduce((n, p) => n + Number(p.totalDiscount || 0), 0)), stackingPrevented: candidates.length > applied.length };
}

export async function recordGroceryPromotionUsage(tx: any, businessId: string, userId: string | null, document: any, evaluation: any) {
  for (const p of evaluation?.appliedPromotions || []) { const referenceNo = `${document.id}:${p.promotionId}`; if (await tx.industryRecord.findFirst({ where: { businessId, industryCode: "grocery", entityType: "grocery_promotion_usage", referenceNo } })) continue; await tx.industryRecord.create({ data: { businessId, industryCode: "grocery", entityType: "grocery_promotion_usage", referenceNo, displayName: `${document.documentNo} · ${p.name}`, relatedEntityId: p.promotionId, status: "applied", amount: money(p.totalDiscount), currency: document.currency || "QAR", startAt: document.issuedAt || new Date(), data: { salesDocumentId: document.id, documentNo: document.documentNo, customerId: document.customerId || null, promotionId: p.promotionId, promotionName: p.name, code: p.code, type: p.type, discount: money(p.totalDiscount) }, createdByUserId: userId, updatedByUserId: userId } }); }
}

async function customerPrice(businessId: string, customerId: string, productId: string, at = new Date()) {
  const rows = await db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_customer_price", referenceNo: `${customerId}:${productId}`, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 10 });
  return rows.find((r: any) => (!r.startAt || new Date(r.startAt) <= at) && (!r.dueAt || new Date(r.dueAt) >= at) && String(r.status).toLowerCase() === "active") || null;
}
export async function resolveGroceryPrice(businessId: string, input: any) {
  const productId = text(input?.productId); if (!productId) throw new ApiError(400, "productId is required");
  const product = await db.product.findFirst({ where: { id: productId, businessId, active: true, deleted: false } }); if (!product) throw new ApiError(404, "Product not found");
  const gp = readGroceryProductProfile(product), customerId = text(input?.customerId) || null, level = text(input?.priceLevel || "retail").toLowerCase(); let price = gp.retailPrice, source = "retail";
  if (level === "wholesale" && gp.wholesalePrice > 0) { price = gp.wholesalePrice; source = "wholesale"; } else if (level === "member" && gp.memberPrice > 0) { price = gp.memberPrice; source = "member"; } else if (level === "promotional" && gp.promotionalPrice > 0) { price = gp.promotionalPrice; source = "promotional"; }
  if (customerId) { const cp = await customerPrice(businessId, customerId, productId); if (cp) { price = money(json(cp.data).price); source = "customer_specific"; } else if (gp.memberPrice > 0 && await db.loyaltyAccount.findFirst({ where: { businessId, customerId } })) { price = gp.memberPrice; source = "member"; } }
  return { productId, sku: product.sku, productName: product.name, price: money(price), source, retailPrice: gp.retailPrice, wholesalePrice: gp.wholesalePrice, memberPrice: gp.memberPrice, promotionalPrice: gp.promotionalPrice };
}
export async function saveCustomerSpecificPrice(req: Request, businessId: string, userId: string, input: any) {
  const customerId = text(input?.customerId), productId = text(input?.productId), price = money(input?.price); if (!customerId || !productId || price < 0) throw new ApiError(400, "customerId, productId and non-negative price are required");
  const [customer, product] = await Promise.all([db.customer.findFirst({ where: { id: customerId, businessId, active: true } }), db.product.findFirst({ where: { id: productId, businessId, active: true, deleted: false } })]); if (!customer || !product) throw new ApiError(404, "Customer or product not found");
  return db.$transaction(async (tx: any) => { const referenceNo = `${customerId}:${productId}`, before = await tx.industryRecord.findFirst({ where: { businessId, industryCode: "grocery", entityType: "grocery_customer_price", referenceNo, archivedAt: null }, orderBy: { createdAt: "desc" } }); if (before) await tx.industryRecord.update({ where: { id: before.id }, data: { status: "superseded", archivedAt: new Date(), revision: { increment: 1 }, updatedByUserId: userId } }); const row = await tx.industryRecord.create({ data: { businessId, industryCode: "grocery", entityType: "grocery_customer_price", referenceNo, displayName: `${customer.name} · ${product.name}`, relatedEntityId: product.id, status: "active", startAt: input?.startsAt ? new Date(String(input.startsAt)) : new Date(), dueAt: input?.endsAt ? new Date(String(input.endsAt)) : null, amount: price, currency: text(input?.currency || "QAR").toUpperCase(), data: { customerId, customerName: customer.name, productId, sku: product.sku, productName: product.name, price, reason: text(input?.reason) || null }, createdByUserId: userId, updatedByUserId: userId } }); await writeAudit(tx, req, { businessId, userId, action: "grocery.customer_price.set", entityType: "Product", entityId: product.id, before: before ? json(before.data) : undefined, after: json(row.data) }); return row; });
}
export async function groceryPriceHistory(businessId: string, productId: string) {
  const rows = await db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", relatedEntityId: productId, entityType: { in: ["grocery_price_history", "grocery_customer_price"] } }, orderBy: { createdAt: "desc" }, take: 500 });
  return rows.map((r: any) => ({ id: r.id, changedAt: r.createdAt, changedByUserId: r.createdByUserId, type: r.entityType, previous: json(r.data).previous || null, next: json(r.data).next || json(r.data), reason: json(r.data).reason || null }));
}

async function program(tx: any, businessId: string) { return tx.loyaltyProgram.findFirst({ where: { businessId, active: true }, orderBy: { createdAt: "asc" } }); }
async function account(tx: any, businessId: string, customer: any) { return await tx.loyaltyAccount.findFirst({ where: { businessId, customerId: customer.id } }) || tx.loyaltyAccount.create({ data: { businessId, customerId: customer.id, customerName: customer.name, points: 0, tier: "Bronze" } }); }
function tier(points: number) { return points >= 10000 ? "Platinum" : points >= 5000 ? "Gold" : points >= 1000 ? "Silver" : "Bronze"; }
export async function reconcileExpiredLoyalty(tx: any, businessId: string, customerId: string, userId?: string | null) {
  const now = new Date(), all = await tx.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_loyalty_tranche", status: "active", dueAt: { lt: now }, archivedAt: null }, orderBy: { dueAt: "asc" } }), rows = all.filter((r: any) => text(json(r.data).customerId) === customerId && Number(json(r.data).remainingPoints || 0) > 0); if (!rows.length) return 0;
  const customer = await tx.customer.findFirst({ where: { id: customerId, businessId } }); if (!customer) return 0; const a = await account(tx, businessId, customer); let expired = 0;
  for (const row of rows) { const points = Math.min(Number(json(row.data).remainingPoints || 0), Math.max(0, Number(a.points || 0) - expired)); if (points <= 0) continue; expired += points; await tx.industryRecord.update({ where: { id: row.id }, data: { status: "expired", archivedAt: now, data: { ...json(row.data), remainingPoints: 0, expiredPoints: points, expiredAt: now.toISOString() }, revision: { increment: 1 }, updatedByUserId: userId || null } }); await tx.loyaltyLedger.create({ data: { businessId, customerId, customerName: customer.name, type: "expire", points: -points, value: 0, referenceNo: row.referenceNo, notes: "Loyalty points expired" } }); }
  if (expired > 0) { const next = Math.max(0, Number(a.points || 0) - expired); await tx.loyaltyAccount.update({ where: { id: a.id }, data: { points: next, tier: tier(next) } }); } return expired;
}
export async function applyGrocerySaleLoyalty(tx: any, businessId: string, userId: string | null, document: any) {
  if (!document?.customerId || String(document.documentType) !== "INVOICE" || ["DRAFT", "CANCELLED", "VOID"].includes(String(document.status))) return null;
  if (await tx.loyaltyLedger.findFirst({ where: { businessId, customerId: document.customerId, type: "earn", referenceNo: `SALE:${document.documentNo}` } })) return null;
  const [p, customer] = await Promise.all([program(tx, businessId), tx.customer.findFirst({ where: { id: document.customerId, businessId, active: true } })]); if (!p || !customer) return null; await reconcileExpiredLoyalty(tx, businessId, customer.id, userId); const rules = json(p.rules);
  let points = Number(document.total || 0) * Number(p.pointsPerCurrency || 1); const items = document.items || await tx.salesDocumentItem.findMany({ where: { salesDocumentId: document.id, businessId } }), perProduct = json(rules.pointsPerProduct);
  for (const item of items) points += Number(perProduct[String(item.productId)] ?? perProduct[String(item.sku)] ?? 0) * Number(item.qty || 0); if (Number(rules.bonusPoints || 0) > 0 && (!Number(rules.bonusThreshold || 0) || Number(document.total || 0) >= Number(rules.bonusThreshold))) points += Number(rules.bonusPoints); points = money(points); if (points <= 0) return null;
  const a = await account(tx, businessId, customer), next = money(Number(a.points || 0) + points); await tx.loyaltyAccount.update({ where: { id: a.id }, data: { points: next, tier: tier(next), customerName: customer.name } }); const ledger = await tx.loyaltyLedger.create({ data: { businessId, customerId: customer.id, customerName: customer.name, type: "earn", points, value: money(document.total), referenceNo: `SALE:${document.documentNo}`, notes: "Automatic Grocery sale loyalty earning" } }); const expiryDays = Math.max(0, Math.trunc(Number(rules.pointsExpiryDays || 0))); await tx.industryRecord.create({ data: { businessId, industryCode: "grocery", entityType: "grocery_loyalty_tranche", referenceNo: `LOY-${ledger.id}`, displayName: `${customer.name} · ${points} points`, relatedEntityId: ledger.id, status: "active", startAt: document.issuedAt || new Date(), dueAt: expiryDays ? new Date(Date.now() + expiryDays * 86_400_000) : null, amount: points, data: { customerId: customer.id, customerName: customer.name, ledgerId: ledger.id, sourceSalesDocumentId: document.id, points, remainingPoints: points, expiryDays }, createdByUserId: userId, updatedByUserId: userId } }); return ledger;
}
export async function groceryLoyaltySummary(businessId: string, customerId: string) { return db.$transaction(async (tx: any) => { const customer = await tx.customer.findFirst({ where: { id: customerId, businessId, active: true } }); if (!customer) throw new ApiError(404, "Customer not found"); const expiredNow = await reconcileExpiredLoyalty(tx, businessId, customerId), a = await account(tx, businessId, customer), history = await tx.loyaltyLedger.findMany({ where: { businessId, customerId }, orderBy: { createdAt: "desc" }, take: 250 }); const earned = money(history.filter((x: any) => Number(x.points) > 0).reduce((n: number, x: any) => n + Number(x.points || 0), 0)), redeemed = money(Math.abs(history.filter((x: any) => String(x.type).toLowerCase() === "redeem").reduce((n: number, x: any) => n + Number(x.points || 0), 0))), expired = money(Math.abs(history.filter((x: any) => String(x.type).toLowerCase() === "expire").reduce((n: number, x: any) => n + Number(x.points || 0), 0))); return { customer: { id: customer.id, name: customer.name }, account: a, pointsEarned: earned, pointsRedeemed: redeemed, pointsExpired: expired, pointsExpiredNow: expiredNow, availablePoints: money(a.points), history }; }); }
export async function redeemGroceryLoyalty(req: Request, businessId: string, userId: string, input: any) {
  const customerId = text(input?.customerId), requested = Math.abs(Number(input?.points || 0)); if (!customerId || requested <= 0) throw new ApiError(400, "customerId and positive points are required");
  return db.$transaction(async (tx: any) => { const customer = await tx.customer.findFirst({ where: { id: customerId, businessId, active: true } }); if (!customer) throw new ApiError(404, "Customer not found"); const p = await program(tx, businessId); if (!p) throw new ApiError(409, "No active loyalty program"); await reconcileExpiredLoyalty(tx, businessId, customerId, userId); const a = await account(tx, businessId, customer), rules = json(p.rules), minimum = Math.max(0, Number(rules.minimumRedemption || 0)); if (minimum && requested < minimum) throw new ApiError(409, `Minimum redemption is ${minimum} points`); if (Number(a.points || 0) + .001 < requested) throw new ApiError(409, "Insufficient loyalty points"); const next = money(Number(a.points || 0) - requested); await tx.loyaltyAccount.update({ where: { id: a.id }, data: { points: next, tier: tier(next) } }); const value = money(requested * Number(p.redemptionRate || 0)), ledger = await tx.loyaltyLedger.create({ data: { businessId, customerId, customerName: customer.name, type: "redeem", points: -requested, value, referenceNo: text(input?.referenceNo) || null, notes: text(input?.notes) || null } }); let remaining = requested; const all = await tx.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_loyalty_tranche", status: "active", archivedAt: null }, orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }] }); for (const row of all.filter((r: any) => text(json(r.data).customerId) === customerId)) { if (remaining <= 0) break; const d = json(row.data), available = Number(d.remainingPoints || 0), used = Math.min(available, remaining); if (used <= 0) continue; remaining -= used; const left = money(available - used); await tx.industryRecord.update({ where: { id: row.id }, data: { status: left <= 0 ? "consumed" : "active", data: { ...d, remainingPoints: left, redeemedPoints: money(Number(d.redeemedPoints || 0) + used) }, revision: { increment: 1 }, updatedByUserId: userId } }); } await writeAudit(tx, req, { businessId, userId, action: "grocery.loyalty.redeem", entityType: "LoyaltyLedger", entityId: ledger.id, after: { customerId, points: requested, value, availablePoints: next } }); return { account: { ...a, points: next, tier: tier(next) }, ledger, redemptionValue: value }; });
}
