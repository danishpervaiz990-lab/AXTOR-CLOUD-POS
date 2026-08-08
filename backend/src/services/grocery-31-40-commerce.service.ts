import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "./audit.service.js";
import { ApiError, cleanString, roundMoney } from "../utils/http.js";
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

function normalizePromotionType(value: unknown) {
  const raw = text(value).toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = { flat: "fixed_discount", fixed: "fixed_discount", percent: "percentage_discount", percentage: "percentage_discount", bogo: "buy_one_get_one", bxgy: "buy_x_get_y", bundle: "bundle_pricing", mixmatch: "mix_and_match", promo_code: "coupon" };
  const type = aliases[raw] || raw;
  if (!(GROCERY_PROMOTION_TYPES as readonly string[]).includes(type)) throw new ApiError(400, `Unsupported Grocery promotion type: ${raw || "blank"}`);
  return type;
}

function normalizedScope(input: any) {
  const s = json(input?.scope);
  const arr = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))].slice(0, 1000);
  return {
    ...s,
    productIds: arr(s.productIds ?? input?.productIds),
    categories: arr(s.categories ?? input?.categories),
    customerIds: arr(s.customerIds ?? input?.customerIds),
    customerGroups: arr(s.customerGroups ?? input?.customerGroups),
    buyProductIds: arr(s.buyProductIds ?? input?.buyProductIds),
    getProductIds: arr(s.getProductIds ?? input?.getProductIds),
    bundleProductIds: arr(s.bundleProductIds ?? input?.bundleProductIds),
    mixProductIds: arr(s.mixProductIds ?? input?.mixProductIds),
    minimumQuantity: Math.max(0, Number(s.minimumQuantity ?? input?.minimumQuantity ?? 0)),
    minimumInvoiceAmount: Math.max(0, Number(s.minimumInvoiceAmount ?? input?.minimumInvoiceAmount ?? 0)),
    maximumDiscount: Math.max(0, Number(s.maximumDiscount ?? input?.maximumDiscount ?? 0)),
    usageLimit: Math.max(0, Math.trunc(Number(s.usageLimit ?? input?.usageLimit ?? 0))),
    perCustomerUsageLimit: Math.max(0, Math.trunc(Number(s.perCustomerUsageLimit ?? input?.perCustomerUsageLimit ?? 0))),
    buyQuantity: Math.max(1, Number(s.buyQuantity ?? input?.buyQuantity ?? 1)),
    getQuantity: Math.max(1, Number(s.getQuantity ?? input?.getQuantity ?? 1)),
    bundlePrice: Math.max(0, Number(s.bundlePrice ?? input?.bundlePrice ?? 0)),
    mixPrice: Math.max(0, Number(s.mixPrice ?? input?.mixPrice ?? 0)),
    discountMode: text(s.discountMode ?? input?.discountMode || "percentage").toLowerCase(),
    allowStacking: bool(s.allowStacking ?? input?.allowStacking, false),
    priority: Number(s.priority ?? input?.priority ?? 100),
    tiers: Array.isArray(s.tiers ?? input?.tiers) ? (s.tiers ?? input?.tiers).slice(0, 50) : [],
  };
}

export async function listGroceryPromotions(businessId: string, query: any = {}) {
  const where: any = { businessId };
  if (query.active !== undefined) where.active = ["1", "true", "yes"].includes(String(query.active).toLowerCase());
  const rows = await db.promotion.findMany({ where, orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
  return rows.map((r: any) => ({ ...r, value: Number(r.value || 0), scope: normalizedScope({ scope: r.scope }) }));
}

export async function saveGroceryPromotion(req: Request, businessId: string, userId: string, id: string | null, input: any) {
  const name = text(input?.name);
  if (!name) throw new ApiError(400, "Promotion name is required");
  const type = normalizePromotionType(input?.type);
  const value = money(input?.value);
  const code = text(input?.code).toUpperCase() || null;
  const scope = normalizedScope(input);
  const startsAt = input?.startsAt || input?.startDate ? new Date(String(input.startsAt || input.startDate)) : null;
  const endsAt = input?.endsAt || input?.endDate ? new Date(String(input.endsAt || input.endDate)) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new ApiError(400, "Invalid promotion start date");
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new ApiError(400, "Invalid promotion end date");
  if (startsAt && endsAt && startsAt > endsAt) throw new ApiError(400, "Promotion start date cannot be after end date");
  return db.$transaction(async (tx: any) => {
    const before = id ? await tx.promotion.findFirst({ where: { id, businessId } }) : null;
    if (id && !before) throw new ApiError(404, "Promotion not found");
    if (code) {
      const duplicate = await tx.promotion.findFirst({ where: { businessId, code, ...(id ? { id: { not: id } } : {}) } });
      if (duplicate) throw new ApiError(409, "Promotion code already exists");
    }
    const data = { name, type, value, valueText: text(input?.valueText) || null, code, scope, startsAt, endsAt, active: input?.active === undefined ? true : bool(input.active) };
    const row = id ? await tx.promotion.update({ where: { id }, data }) : await tx.promotion.create({ data: { businessId, ...data } });
    await writeAudit(tx, req, { businessId, userId, action: id ? "grocery.promotion.update" : "grocery.promotion.create", entityType: "Promotion", entityId: row.id, before: before || undefined, after: row });
    return row;
  });
}

export async function removeGroceryPromotion(req: Request, businessId: string, userId: string, id: string) {
  return db.$transaction(async (tx: any) => {
    const before = await tx.promotion.findFirst({ where: { id, businessId } });
    if (!before) throw new ApiError(404, "Promotion not found");
    const row = await tx.promotion.update({ where: { id }, data: { active: false } });
    await writeAudit(tx, req, { businessId, userId, action: "grocery.promotion.deactivate", entityType: "Promotion", entityId: id, before, after: row });
    return row;
  });
}

type CartLine = { index: number; productId: string; sku: string; category: string; qty: number; unitPrice: number; lineAmount: number; product: any };

async function cartContext(businessId: string, input: any) {
  const raw = Array.isArray(input?.items) ? input.items : [];
  if (!raw.length) throw new ApiError(400, "Promotion evaluation requires cart items");
  const ids = [...new Set(raw.map((x: any) => text(x.productId)).filter(Boolean))];
  const products = await db.product.findMany({ where: { businessId, id: { in: ids }, active: true, deleted: false } });
  const byId = new Map(products.map((p: any) => [String(p.id), p]));
  const lines: CartLine[] = raw.map((x: any, index: number) => {
    const p: any = byId.get(text(x.productId));
    if (!p) throw new ApiError(400, "Promotion cart contains an invalid product");
    const lineQty = qty(x.qty ?? x.quantity);
    if (lineQty <= 0) throw new ApiError(400, `Invalid quantity for ${p.name}`);
    const unitPrice = money(x.unitPrice ?? x.rate ?? x.price ?? p.price);
    return { index, productId: p.id, sku: p.sku || "", category: p.category || "", qty: lineQty, unitPrice, lineAmount: money(lineQty * unitPrice), product: p };
  });
  const customerId = text(input?.customerId) || null;
  const customer = customerId ? await db.customer.findFirst({ where: { id: customerId, businessId, active: true } }) : null;
  const loyalty = customerId ? await db.loyaltyAccount.findFirst({ where: { businessId, customerId } }) : null;
  const customerFields = json(customer?.customFields || customer?.metadata);
  const customerGroup = text(input?.customerGroup || customerFields.group || customerFields.customerGroup || (loyalty ? "member" : ""));
  return { lines, customer, loyalty, customerGroup, subtotal: money(lines.reduce((s, l) => s + l.lineAmount, 0)) };
}

function lineMatches(scope: any, line: CartLine) {
  if (scope.productIds?.length && !scope.productIds.includes(String(line.productId))) return false;
  if (scope.categories?.length && !scope.categories.map((x: string) => x.toLowerCase()).includes(String(line.category).toLowerCase())) return false;
  return true;
}

function capped(discount: number, scope: any) {
  const max = Number(scope.maximumDiscount || 0);
  return money(Math.max(0, max > 0 ? Math.min(discount, max) : discount));
}

async function usageAllowed(businessId: string, promotion: any, customerId: string | null, scope: any) {
  const totalLimit = Number(scope.usageLimit || 0);
  const customerLimit = Number(scope.perCustomerUsageLimit || 0);
  if (!totalLimit && !customerLimit) return true;
  const rows = await db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_promotion_usage", relatedEntityId: promotion.id, archivedAt: null }, select: { data: true } });
  if (totalLimit && rows.length >= totalLimit) return false;
  if (customerLimit && customerId) {
    const used = rows.filter((r: any) => text(json(r.data).customerId) === customerId).length;
    if (used >= customerLimit) return false;
  }
  return true;
}

function discountForPromotion(promotion: any, scope: any, ctx: any) {
  const type = normalizePromotionType(promotion.type);
  const eligible = ctx.lines.filter((l: CartLine) => lineMatches(scope, l));
  const eligibleAmount = eligible.reduce((s: number, l: CartLine) => s + l.lineAmount, 0);
  const eligibleQty = eligible.reduce((s: number, l: CartLine) => s + l.qty, 0);
  if (scope.minimumInvoiceAmount && ctx.subtotal + 0.001 < scope.minimumInvoiceAmount) return null;
  if (scope.minimumQuantity && eligibleQty + 0.001 < scope.minimumQuantity) return null;
  if (scope.customerIds?.length && (!ctx.customer || !scope.customerIds.includes(String(ctx.customer.id)))) return null;
  if (scope.customerGroups?.length && !scope.customerGroups.map((x: string) => x.toLowerCase()).includes(String(ctx.customerGroup).toLowerCase())) return null;
  const value = Number(promotion.value || 0);
  const lineDiscounts: Record<number, number> = {};
  let invoiceDiscount = 0;
  let priceOverrides: Record<number, number> = {};
  if (["fixed_discount", "scheduled_promotion", "coupon"].includes(type)) invoiceDiscount = value;
  else if (type === "percentage_discount") invoiceDiscount = ctx.subtotal * value / 100;
  else if (type === "product_discount" || type === "category_discount") {
    for (const l of eligible) lineDiscounts[l.index] = money(scope.discountMode === "fixed" ? Math.min(l.lineAmount, value) : l.lineAmount * value / 100);
  } else if (type === "member_price") {
    if (!ctx.loyalty) return null;
    for (const l of eligible) { const profile = readGroceryProductProfile(l.product); if (profile.memberPrice > 0 && profile.memberPrice < l.unitPrice) priceOverrides[l.index] = profile.memberPrice; }
  } else if (type === "customer_specific_price") {
    if (!ctx.customer) return null;
  } else if (type === "buy_one_get_one" || type === "buy_x_get_y") {
    const buyIds = scope.buyProductIds?.length ? scope.buyProductIds : scope.productIds;
    const getIds = scope.getProductIds?.length ? scope.getProductIds : buyIds;
    const buys = ctx.lines.filter((l: CartLine) => !buyIds?.length || buyIds.includes(String(l.productId)));
    const gets = ctx.lines.filter((l: CartLine) => !getIds?.length || getIds.includes(String(l.productId))).sort((a: CartLine, b: CartLine) => a.unitPrice - b.unitPrice);
    const buyQty = Math.max(1, Number(type === "buy_one_get_one" ? 1 : scope.buyQuantity || 1));
    const getQty = Math.max(1, Number(type === "buy_one_get_one" ? 1 : scope.getQuantity || 1));
    const qualifying = Math.floor(buys.reduce((s: number, l: CartLine) => s + l.qty, 0) / buyQty) * getQty;
    let left = qualifying;
    for (const l of gets) { if (left <= 0) break; const free = Math.min(left, l.qty); lineDiscounts[l.index] = money((lineDiscounts[l.index] || 0) + free * l.unitPrice); left -= free; }
  } else if (type === "quantity_break") {
    const tiers = (Array.isArray(scope.tiers) ? scope.tiers : []).map((t: any) => ({ minQty: Number(t.minQty || t.quantity || 0), price: Number(t.price || 0), discountPercent: Number(t.discountPercent || 0) })).filter((t: any) => t.minQty > 0).sort((a: any, b: any) => b.minQty - a.minQty);
    for (const l of eligible) { const tier = tiers.find((t: any) => l.qty >= t.minQty); if (!tier) continue; if (tier.price > 0 && tier.price < l.unitPrice) priceOverrides[l.index] = money(tier.price); else if (tier.discountPercent > 0) lineDiscounts[l.index] = money(l.lineAmount * tier.discountPercent / 100); }
  } else if (type === "bundle_pricing" || type === "mix_and_match") {
    const ids = type === "bundle_pricing" ? scope.bundleProductIds : scope.mixProductIds;
    if (!ids?.length || !ids.every((id: string) => ctx.lines.some((l: CartLine) => String(l.productId) === String(id)))) return null;
    const bundleAmount = ctx.lines.filter((l: CartLine) => ids.includes(String(l.productId))).reduce((s: number, l: CartLine) => s + l.lineAmount, 0);
    const target = Number(type === "bundle_pricing" ? scope.bundlePrice : scope.mixPrice);
    if (target > 0 && bundleAmount > target) invoiceDiscount = bundleAmount - target;
  }
  let totalDiscount = invoiceDiscount + Object.values(lineDiscounts).reduce((s, d) => s + Number(d || 0), 0);
  for (const [indexText, price] of Object.entries(priceOverrides)) {
    const line = ctx.lines[Number(indexText)];
    if (line) totalDiscount += Math.max(0, (line.unitPrice - Number(price)) * line.qty);
  }
  totalDiscount = capped(totalDiscount, scope);
  if (totalDiscount <= 0) return null;
  if (scope.maximumDiscount > 0) {
    const raw = invoiceDiscount + Object.values(lineDiscounts).reduce((s, d) => s + Number(d || 0), 0);
    if (raw > scope.maximumDiscount && raw > 0) {
      const ratio = scope.maximumDiscount / raw;
      invoiceDiscount = money(invoiceDiscount * ratio);
      for (const k of Object.keys(lineDiscounts)) lineDiscounts[Number(k)] = money(lineDiscounts[Number(k)] * ratio);
    }
  }
  return { promotionId: promotion.id, name: promotion.name, code: promotion.code || null, type, priority: Number(scope.priority || 100), allowStacking: Boolean(scope.allowStacking), invoiceDiscount: money(invoiceDiscount), lineDiscounts, priceOverrides, totalDiscount: money(totalDiscount) };
}

export async function evaluateGroceryPromotions(businessId: string, input: any) {
  const ctx = await cartContext(businessId, input);
  const now = new Date();
  const code = text(input?.promoCode || input?.couponCode).toUpperCase();
  const promotions = await db.promotion.findMany({ where: { businessId, active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }, ...(code ? [{ OR: [{ code }, { code: null }] }] : [])] }, orderBy: { createdAt: "asc" } });
  const candidates: any[] = [];
  for (const promotion of promotions) {
    if (promotion.code && code !== String(promotion.code).toUpperCase()) continue;
    const scope = normalizedScope({ scope: promotion.scope });
    if (!await usageAllowed(businessId, promotion, ctx.customer?.id || null, scope)) continue;
    const calculated = discountForPromotion(promotion, scope, ctx);
    if (calculated) candidates.push(calculated);
  }
  candidates.sort((a, b) => a.priority - b.priority || b.totalDiscount - a.totalDiscount);
  const applied: any[] = [];
  for (const candidate of candidates) {
    if (!applied.length) { applied.push(candidate); continue; }
    if (!candidate.allowStacking || applied.some((p) => !p.allowStacking)) continue;
    applied.push(candidate);
  }
  const lineDiscounts: Record<number, number> = {};
  const priceOverrides: Record<number, number> = {};
  let invoiceDiscount = 0;
  for (const p of applied) {
    invoiceDiscount += Number(p.invoiceDiscount || 0);
    for (const [k, v] of Object.entries(p.lineDiscounts || {})) lineDiscounts[Number(k)] = money((lineDiscounts[Number(k)] || 0) + Number(v || 0));
    for (const [k, v] of Object.entries(p.priceOverrides || {})) priceOverrides[Number(k)] = Math.min(priceOverrides[Number(k)] || Number.MAX_SAFE_INTEGER, Number(v || 0));
  }
  const totalDiscount = money(applied.reduce((s, p) => s + Number(p.totalDiscount || 0), 0));
  return { subtotal: ctx.subtotal, customerId: ctx.customer?.id || null, customerGroup: ctx.customerGroup || null, appliedPromotions: applied, invoiceDiscount: money(invoiceDiscount), lineDiscounts, priceOverrides, totalDiscount, stackingPrevented: candidates.length > applied.length };
}

export async function recordGroceryPromotionUsage(tx: any, businessId: string, userId: string | null, document: any, evaluation: any) {
  for (const applied of evaluation?.appliedPromotions || []) {
    const referenceNo = `${document.id}:${applied.promotionId}`;
    const existing = await tx.industryRecord.findFirst({ where: { businessId, industryCode: "grocery", entityType: "grocery_promotion_usage", referenceNo } });
    if (existing) continue;
    await tx.industryRecord.create({ data: { businessId, industryCode: "grocery", entityType: "grocery_promotion_usage", referenceNo, displayName: `${document.documentNo} · ${applied.name}`, relatedEntityId: applied.promotionId, status: "applied", amount: money(applied.totalDiscount), currency: document.currency || "QAR", startAt: document.issuedAt || new Date(), data: { salesDocumentId: document.id, documentNo: document.documentNo, customerId: document.customerId || null, promotionId: applied.promotionId, promotionName: applied.name, code: applied.code, type: applied.type, discount: money(applied.totalDiscount) }, createdByUserId: userId, updatedByUserId: userId } });
  }
}

async function activeCustomerPrice(businessId: string, customerId: string, productId: string, at = new Date()) {
  const rows = await db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_customer_price", referenceNo: `${customerId}:${productId}`, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 10 });
  return rows.find((r: any) => (!r.startAt || new Date(r.startAt) <= at) && (!r.dueAt || new Date(r.dueAt) >= at) && String(r.status).toLowerCase() === "active") || null;
}

export async function resolveGroceryPrice(businessId: string, input: any) {
  const productId = text(input?.productId);
  if (!productId) throw new ApiError(400, "productId is required");
  const product = await db.product.findFirst({ where: { id: productId, businessId, active: true, deleted: false } });
  if (!product) throw new ApiError(404, "Product not found");
  const profile = readGroceryProductProfile(product);
  const customerId = text(input?.customerId) || null;
  const level = text(input?.priceLevel || "retail").toLowerCase();
  let price = profile.retailPrice;
  let source = "retail";
  if (level === "wholesale" && profile.wholesalePrice > 0) { price = profile.wholesalePrice; source = "wholesale"; }
  if (level === "member" && profile.memberPrice > 0) { price = profile.memberPrice; source = "member"; }
  if (level === "promotional" && profile.promotionalPrice > 0) { price = profile.promotionalPrice; source = "promotional"; }
  if (customerId) {
    const customerPrice = await activeCustomerPrice(businessId, customerId, productId);
    if (customerPrice) { price = money(json(customerPrice.data).price); source = "customer_specific"; }
    else {
      const member = await db.loyaltyAccount.findFirst({ where: { businessId, customerId } });
      if (member && profile.memberPrice > 0 && ["retail", "member"].includes(level)) { price = profile.memberPrice; source = "member"; }
    }
  }
  return { productId, sku: product.sku, productName: product.name, price: money(price), source, retailPrice: profile.retailPrice, wholesalePrice: profile.wholesalePrice, memberPrice: profile.memberPrice, promotionalPrice: profile.promotionalPrice };
}

export async function saveCustomerSpecificPrice(req: Request, businessId: string, userId: string, input: any) {
  const customerId = text(input?.customerId), productId = text(input?.productId), price = money(input?.price);
  if (!customerId || !productId || price < 0) throw new ApiError(400, "customerId, productId and non-negative price are required");
  const [customer, product] = await Promise.all([db.customer.findFirst({ where: { id: customerId, businessId, active: true } }), db.product.findFirst({ where: { id: productId, businessId, active: true, deleted: false } })]);
  if (!customer || !product) throw new ApiError(404, "Customer or product not found");
  return db.$transaction(async (tx: any) => {
    const referenceNo = `${customerId}:${productId}`;
    const before = await tx.industryRecord.findFirst({ where: { businessId, industryCode: "grocery", entityType: "grocery_customer_price", referenceNo, archivedAt: null }, orderBy: { createdAt: "desc" } });
    if (before) await tx.industryRecord.update({ where: { id: before.id }, data: { status: "superseded", archivedAt: new Date(), revision: { increment: 1 }, updatedByUserId: userId } });
    const row = await tx.industryRecord.create({ data: { businessId, industryCode: "grocery", entityType: "grocery_customer_price", referenceNo, displayName: `${customer.name} · ${product.name}`, relatedEntityId: product.id, status: "active", startAt: input?.startsAt ? new Date(String(input.startsAt)) : new Date(), dueAt: input?.endsAt ? new Date(String(input.endsAt)) : null, amount: price, currency: text(input?.currency || "QAR").toUpperCase(), data: { customerId, customerName: customer.name, productId, sku: product.sku, productName: product.name, price, reason: text(input?.reason) || null }, createdByUserId: userId, updatedByUserId: userId } });
    await writeAudit(tx, req, { businessId, userId, action: "grocery.customer_price.set", entityType: "Product", entityId: product.id, before: before ? json(before.data) : undefined, after: json(row.data) });
    return row;
  });
}

export async function groceryPriceHistory(businessId: string, productId: string) {
  const rows = await db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: { in: ["grocery_price_history", "grocery_customer_price"] }, OR: [{ relatedEntityId: productId }, { data: { path: ["productId"], equals: productId } }], archivedAt: null }, orderBy: { createdAt: "desc" }, take: 500 }).catch(async () => db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_price_history", relatedEntityId: productId }, orderBy: { createdAt: "desc" }, take: 500 }));
  return rows.map((r: any) => ({ id: r.id, changedAt: r.createdAt, changedByUserId: r.createdByUserId, type: r.entityType, previous: json(r.data).previous || null, next: json(r.data).next || json(r.data), reason: json(r.data).reason || null }));
}

async function loyaltyProgram(tx: any, businessId: string) {
  return tx.loyaltyProgram.findFirst({ where: { businessId, active: true }, orderBy: { createdAt: "asc" } });
}

async function loyaltyAccount(tx: any, businessId: string, customer: any) {
  let account = await tx.loyaltyAccount.findFirst({ where: { businessId, customerId: customer.id } });
  if (!account) account = await tx.loyaltyAccount.create({ data: { businessId, customerId: customer.id, customerName: customer.name, points: 0, tier: "Bronze" } });
  return account;
}

function loyaltyTier(points: number) { if (points >= 10000) return "Platinum"; if (points >= 5000) return "Gold"; if (points >= 1000) return "Silver"; return "Bronze"; }

export async function reconcileExpiredLoyalty(tx: any, businessId: string, customerId: string, userId?: string | null) {
  const now = new Date();
  const tranches = await tx.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_loyalty_tranche", status: "active", dueAt: { lt: now }, archivedAt: null }, orderBy: { dueAt: "asc" } });
  const customerTranches = tranches.filter((r: any) => text(json(r.data).customerId) === customerId && Number(json(r.data).remainingPoints || 0) > 0);
  if (!customerTranches.length) return 0;
  const customer = await tx.customer.findFirst({ where: { id: customerId, businessId } });
  if (!customer) return 0;
  const account = await loyaltyAccount(tx, businessId, customer);
  let expired = 0;
  for (const row of customerTranches) {
    const points = Math.min(Number(json(row.data).remainingPoints || 0), Math.max(0, Number(account.points || 0) - expired));
    if (points <= 0) continue;
    expired += points;
    await tx.industryRecord.update({ where: { id: row.id }, data: { status: "expired", archivedAt: now, data: { ...json(row.data), remainingPoints: 0, expiredPoints: points, expiredAt: now.toISOString() }, revision: { increment: 1 }, updatedByUserId: userId || null } });
    await tx.loyaltyLedger.create({ data: { businessId, customerId, customerName: customer.name, type: "expire", points: -points, value: 0, referenceNo: row.referenceNo, notes: "Loyalty points expired" } });
  }
  if (expired > 0) { const next = Math.max(0, Number(account.points || 0) - expired); await tx.loyaltyAccount.update({ where: { id: account.id }, data: { points: next, tier: loyaltyTier(next) } }); }
  return expired;
}

export async function applyGrocerySaleLoyalty(tx: any, businessId: string, userId: string | null, document: any) {
  if (!document?.customerId || String(document.documentType) !== "INVOICE" || ["DRAFT", "CANCELLED", "VOID"].includes(String(document.status))) return null;
  const duplicate = await tx.loyaltyLedger.findFirst({ where: { businessId, customerId: document.customerId, type: "earn", referenceNo: `SALE:${document.documentNo}` } });
  if (duplicate) return duplicate;
  const [program, customer] = await Promise.all([loyaltyProgram(tx, businessId), tx.customer.findFirst({ where: { id: document.customerId, businessId, active: true } })]);
  if (!program || !customer) return null;
  await reconcileExpiredLoyalty(tx, businessId, customer.id, userId);
  const rules = json(program.rules);
  let points = Number(document.total || 0) * Number(program.pointsPerCurrency || 1);
  const items = document.items || await tx.salesDocumentItem.findMany({ where: { salesDocumentId: document.id, businessId } });
  const perProduct = json(rules.pointsPerProduct);
  for (const item of items) {
    const extra = Number(perProduct[String(item.productId)] ?? perProduct[String(item.sku)] ?? 0);
    if (extra) points += extra * Number(item.qty || 0);
  }
  const bonusThreshold = Number(rules.bonusThreshold || 0), bonusPoints = Number(rules.bonusPoints || 0);
  if (bonusPoints > 0 && (!bonusThreshold || Number(document.total || 0) >= bonusThreshold)) points += bonusPoints;
  points = money(points);
  if (points <= 0) return null;
  const account = await loyaltyAccount(tx, businessId, customer);
  const next = money(Number(account.points || 0) + points);
  await tx.loyaltyAccount.update({ where: { id: account.id }, data: { points: next, tier: loyaltyTier(next), customerName: customer.name } });
  const ledger = await tx.loyaltyLedger.create({ data: { businessId, customerId: customer.id, customerName: customer.name, type: "earn", points, value: money(document.total), referenceNo: `SALE:${document.documentNo}`, notes: "Automatic Grocery sale loyalty earning" } });
  const expiryDays = Math.max(0, Math.trunc(Number(rules.pointsExpiryDays || 0)));
  await tx.industryRecord.create({ data: { businessId, industryCode: "grocery", entityType: "grocery_loyalty_tranche", referenceNo: `LOY-${ledger.id}`, displayName: `${customer.name} · ${points} points`, relatedEntityId: ledger.id, status: "active", startAt: document.issuedAt || new Date(), dueAt: expiryDays ? new Date(Date.now() + expiryDays * 86_400_000) : null, amount: points, data: { customerId: customer.id, customerName: customer.name, ledgerId: ledger.id, sourceSalesDocumentId: document.id, points, remainingPoints: points, expiryDays }, createdByUserId: userId, updatedByUserId: userId } });
  return ledger;
}

export async function groceryLoyaltySummary(businessId: string, customerId: string) {
  return db.$transaction(async (tx: any) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, businessId, active: true } });
    if (!customer) throw new ApiError(404, "Customer not found");
    const expiredNow = await reconcileExpiredLoyalty(tx, businessId, customerId);
    const account = await loyaltyAccount(tx, businessId, customer);
    const history = await tx.loyaltyLedger.findMany({ where: { businessId, customerId }, orderBy: { createdAt: "desc" }, take: 250 });
    const earned = money(history.filter((x: any) => Number(x.points) > 0).reduce((s: number, x: any) => s + Number(x.points || 0), 0));
    const redeemed = money(Math.abs(history.filter((x: any) => String(x.type).toLowerCase() === "redeem").reduce((s: number, x: any) => s + Number(x.points || 0), 0)));
    const expired = money(Math.abs(history.filter((x: any) => String(x.type).toLowerCase() === "expire").reduce((s: number, x: any) => s + Number(x.points || 0), 0)));
    return { customer: { id: customer.id, name: customer.name }, account, pointsEarned: earned, pointsRedeemed: redeemed, pointsExpired: expired, pointsExpiredNow: expiredNow, availablePoints: money(account.points), history };
  });
}

export async function redeemGroceryLoyalty(req: Request, businessId: string, userId: string, input: any) {
  const customerId = text(input?.customerId);
  const requested = Math.abs(Number(input?.points || 0));
  if (!customerId || requested <= 0) throw new ApiError(400, "customerId and positive points are required");
  return db.$transaction(async (tx: any) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, businessId, active: true } });
    if (!customer) throw new ApiError(404, "Customer not found");
    const program = await loyaltyProgram(tx, businessId);
    if (!program) throw new ApiError(409, "No active loyalty program");
    await reconcileExpiredLoyalty(tx, businessId, customerId, userId);
    const account = await loyaltyAccount(tx, businessId, customer);
    const rules = json(program.rules);
    const minimum = Math.max(0, Number(rules.minimumRedemption || 0));
    if (minimum && requested < minimum) throw new ApiError(409, `Minimum redemption is ${minimum} points`);
    if (Number(account.points || 0) + 0.001 < requested) throw new ApiError(409, "Insufficient loyalty points");
    const next = money(Number(account.points || 0) - requested);
    await tx.loyaltyAccount.update({ where: { id: account.id }, data: { points: next, tier: loyaltyTier(next) } });
    const value = money(requested * Number(program.redemptionRate || 0));
    const ledger = await tx.loyaltyLedger.create({ data: { businessId, customerId, customerName: customer.name, type: "redeem", points: -requested, value, referenceNo: text(input?.referenceNo) || null, notes: text(input?.notes) || null } });
    let remaining = requested;
    const tranches = await tx.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_loyalty_tranche", status: "active", archivedAt: null }, orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }] });
    for (const row of tranches.filter((r: any) => text(json(r.data).customerId) === customerId)) {
      if (remaining <= 0) break;
      const data = json(row.data), available = Number(data.remainingPoints || 0), used = Math.min(available, remaining);
      if (used <= 0) continue;
      remaining -= used;
      const left = money(available - used);
      await tx.industryRecord.update({ where: { id: row.id }, data: { status: left <= 0 ? "consumed" : "active", data: { ...data, remainingPoints: left, redeemedPoints: money(Number(data.redeemedPoints || 0) + used) }, revision: { increment: 1 }, updatedByUserId: userId } });
    }
    await writeAudit(tx, req, { businessId, userId, action: "grocery.loyalty.redeem", entityType: "LoyaltyLedger", entityId: ledger.id, after: { customerId, points: requested, value, availablePoints: next } });
    return { account: { ...account, points: next, tier: loyaltyTier(next) }, ledger, redemptionValue: value };
  });
}
