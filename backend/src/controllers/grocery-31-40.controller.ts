import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import * as loyalty from "../services/loyalty.service.js";
import {
  evaluateGroceryPromotions,
  groceryLoyaltySummary,
  groceryPriceHistory,
  listGroceryPromotions,
  redeemGroceryLoyalty,
  removeGroceryPromotion,
  resolveGroceryPrice,
  saveCustomerSpecificPrice,
  saveGroceryPromotion,
} from "../services/grocery-31-40-commerce.service.js";
import { grocery31To33ReportIds } from "../services/grocery-31-40-accounting.service.js";
import { createSalesReturn } from "./sales-returns.controller.js";
import { groceryCreateSale } from "./grocery-sales.controller.js";
import { writeAudit } from "../services/audit.service.js";

const db: any = prisma;
const text = (v: unknown) => String(v ?? "").trim();
const json = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
function tenant(req: Request) { const businessId = req.tenant?.businessId, userId = req.tenant?.userId; if (!businessId || !userId) throw new Error("Authenticated Grocery tenant is required"); return { businessId, userId }; }
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok: true, data }); }
function fail(res: Response, e: any, status = 400) { return res.status(status).json({ ok: false, error: { message: e?.message || "Request failed" } }); }

export async function grocery31To40Catalog(req: Request, res: Response) {
  try {
    tenant(req);
    return ok(res, {
      accountingReports: grocery31To33ReportIds(),
      modules: ["trial-balance", "balance-sheet", "accounting-reports", "cheques", "users-roles-permissions", "audit-log", "promotions", "loyalty", "returns-refunds-exchange", "price-management"],
      promotionTypes: ["fixed_discount", "percentage_discount", "product_discount", "category_discount", "customer_specific_price", "member_price", "scheduled_promotion", "buy_x_get_y", "buy_one_get_one", "quantity_break", "bundle_pricing", "mix_and_match", "coupon"],
      chequeStatuses: ["upcoming", "due_today", "deposited", "cleared", "bounced", "cancelled", "replaced"],
      priceLevels: ["retail", "wholesale", "customer_specific", "member", "promotional"],
    });
  } catch (e) { return fail(res, e); }
}

export async function groceryAuditLog(req: Request, res: Response) {
  try {
    const t = tenant(req);
    const where: any = { businessId: t.businessId };
    const from = text(req.query.from), to = text(req.query.to), userId = text(req.query.userId), action = text(req.query.action), entityType = text(req.query.entityType), q = text(req.query.q);
    if (from || to) where.createdAt = { ...(from ? { gte: new Date(`${from}T00:00:00.000+03:00`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999+03:00`) } : {}) };
    if (userId) where.userId = userId;
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (entityType) where.entityType = { contains: entityType, mode: "insensitive" };
    if (q) where.OR = [{ action: { contains: q, mode: "insensitive" } }, { entityType: { contains: q, mode: "insensitive" } }, { entityId: { contains: q, mode: "insensitive" } }];
    const rows = await db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(2000, Math.max(1, Number(req.query.limit || 500))) });
    const ids = [...new Set(rows.map((r: any) => r.userId).filter(Boolean))];
    const users = ids.length ? await db.user.findMany({ where: { businessId: t.businessId, id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
    const userMap = new Map<string, any>(users.map((u: any): [string, any] => [String(u.id), u]));
    return ok(res, rows.map((r: any) => ({ timestamp: r.createdAt, user: userMap.get(String(r.userId))?.name || userMap.get(String(r.userId))?.email || "System / unauthenticated", userId: r.userId, action: r.action, entity: r.entityType, entityId: r.entityId, oldValue: r.before, newValue: r.after, tenant: r.businessId, reason: json(r.after).reason || json(r.before).reason || null, ipAddress: r.ipAddress || null, userAgent: r.userAgent || null })));
  } catch (e) { return fail(res, e); }
}

export async function groceryPromotionsList(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await listGroceryPromotions(t.businessId, req.query)); } catch (e) { return fail(res, e); } }
export async function groceryPromotionCreate(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await saveGroceryPromotion(req, t.businessId, t.userId, null, req.body), 201); } catch (e) { return fail(res, e); } }
export async function groceryPromotionUpdate(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await saveGroceryPromotion(req, t.businessId, t.userId, req.params.id, req.body)); } catch (e) { return fail(res, e); } }
export async function groceryPromotionDelete(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await removeGroceryPromotion(req, t.businessId, t.userId, req.params.id)); } catch (e) { return fail(res, e); } }
export async function groceryPromotionEvaluate(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await evaluateGroceryPromotions(t.businessId, req.body)); } catch (e) { return fail(res, e); } }

export async function groceryLoyaltyProgram(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await loyalty.getProgram(t.businessId)); } catch (e) { return fail(res, e); } }
export async function groceryLoyaltyProgramSave(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await loyalty.saveProgram(req, t.businessId, t.userId, req.body)); } catch (e) { return fail(res, e); } }
export async function groceryLoyaltyAccounts(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await loyalty.listAccounts(t.businessId, req.query)); } catch (e) { return fail(res, e); } }
export async function groceryLoyaltyLedger(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await loyalty.ledger(t.businessId, req.query)); } catch (e) { return fail(res, e); } }
export async function groceryLoyaltyCustomerSummary(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await groceryLoyaltySummary(t.businessId, req.params.customerId)); } catch (e) { return fail(res, e); } }
export async function groceryLoyaltyRedeem(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await redeemGroceryLoyalty(req, t.businessId, t.userId, req.body), 201); } catch (e) { return fail(res, e); } }
export async function groceryLoyaltyAdjust(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await loyalty.adjust(req, t.businessId, t.userId, req.body), 201); } catch (e) { return fail(res, e); } }

export async function groceryPriceResolve(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await resolveGroceryPrice(t.businessId, { ...req.query, ...req.body })); } catch (e) { return fail(res, e); } }
export async function groceryCustomerPriceSave(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await saveCustomerSpecificPrice(req, t.businessId, t.userId, req.body), 201); } catch (e) { return fail(res, e); } }
export async function groceryProductPriceHistory(req: Request, res: Response) { try { const t = tenant(req); return ok(res, await groceryPriceHistory(t.businessId, req.params.productId)); } catch (e) { return fail(res, e); } }

function capture() {
  let statusCode = 200, payload: any = null;
  const response: any = { status(code: number) { statusCode = code; return this; }, json(body: any) { payload = body; return this; } };
  return { response: response as Response, read: () => ({ statusCode, payload }) };
}

export async function groceryExchange(req: Request, res: Response) {
  const originalBody = req.body;
  try {
    const t = tenant(req);
    const sourceSalesDocumentId = text(originalBody?.sourceSalesDocumentId || originalBody?.salesDocumentId);
    const reason = text(originalBody?.reason);
    const returnItems = Array.isArray(originalBody?.returnItems) ? originalBody.returnItems : [];
    const replacementItems = Array.isArray(originalBody?.replacementItems) ? originalBody.replacementItems : [];
    const key = text(originalBody?.idempotencyKey || req.headers["idempotency-key"] || `exchange-${Date.now()}`);
    if (!sourceSalesDocumentId || !reason || !returnItems.length || !replacementItems.length) throw new Error("Exchange requires source invoice, return reason, return items and replacement items");
    let workflow = await db.industryRecord.findFirst({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_exchange", idempotencyKey: key } });
    if (workflow?.status === "completed") return ok(res, { exchange: workflow, ...json(workflow.data) });
    if (!workflow) workflow = await db.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_exchange", referenceNo: `EX-${Date.now()}`, displayName: `Exchange for ${sourceSalesDocumentId}`, status: "processing", idempotencyKey: key, relatedEntityId: sourceSalesDocumentId, data: { sourceSalesDocumentId, reason }, createdByUserId: t.userId, updatedByUserId: t.userId } });
    let data = json(workflow.data);
    let salesReturnId = text(data.salesReturnId) || null;
    if (!salesReturnId) {
      const cap = capture();
      req.body = { sourceSalesDocumentId, items: returnItems, reason, notes: text(originalBody?.notes) || null, idempotencyKey: `${key}:return` };
      await createSalesReturn(req, cap.response);
      const ret = cap.read();
      if (!ret.payload?.ok || !ret.payload?.data?.id) {
        await db.industryRecord.update({ where: { id: workflow.id }, data: { status: "failed_return", data: { ...data, returnError: ret.payload?.error?.message || "Return failed" }, revision: { increment: 1 }, updatedByUserId: t.userId } });
        return res.status(ret.statusCode || 400).json(ret.payload || { ok: false, error: { message: "Exchange return failed" } });
      }
      salesReturnId = ret.payload.data.id;
      data = { ...data, salesReturnId, returnNo: ret.payload.data.returnNo };
      await db.industryRecord.update({ where: { id: workflow.id }, data: { status: "return_posted", data, revision: { increment: 1 }, updatedByUserId: t.userId } });
    }
    const cap = capture();
    const originalInvoice = await db.salesDocument.findFirst({ where: { id: sourceSalesDocumentId, businessId: t.businessId } });
    req.body = { ...originalBody, documentType: "invoice", postingMode: "post", items: replacementItems, customerId: originalBody?.customerId || originalInvoice?.customerId || undefined, customerName: originalBody?.customerName || originalInvoice?.customerName || undefined, referenceNo: originalBody?.referenceNo || workflow.referenceNo, idempotencyKey: `${key}:replacement`, returnItems: undefined, replacementItems: undefined, sourceSalesDocumentId: undefined };
    await groceryCreateSale(req, cap.response);
    const sale = cap.read();
    if (!sale.payload?.ok || !sale.payload?.data?.id) {
      await db.industryRecord.update({ where: { id: workflow.id }, data: { status: "return_posted_replacement_failed", data: { ...data, replacementError: sale.payload?.error?.message || "Replacement sale failed" }, revision: { increment: 1 }, updatedByUserId: t.userId } });
      return res.status(409).json({ ok: false, error: { message: "Return was posted but replacement sale failed. Retry this exchange with the same idempotency key.", detail: sale.payload?.error?.message || null }, data: { salesReturnId, exchangeId: workflow.id } });
    }
    data = { ...data, replacementSalesDocumentId: sale.payload.data.id, replacementDocumentNo: sale.payload.data.documentNo, completedAt: new Date().toISOString() };
    workflow = await db.industryRecord.update({ where: { id: workflow.id }, data: { status: "completed", data, revision: { increment: 1 }, updatedByUserId: t.userId } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.exchange.completed", entityType: "Exchange", entityId: workflow.id, after: data });
    return ok(res, { exchange: workflow, salesReturnId, replacementSale: sale.payload.data }, 201);
  } catch (e) { return fail(res, e); }
  finally { req.body = originalBody; }
}
