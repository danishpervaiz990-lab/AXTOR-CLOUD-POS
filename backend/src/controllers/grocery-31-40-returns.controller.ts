import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { createSalesReturn } from "./sales-returns.controller.js";
import { createRefund } from "./refunds.controller.js";
import { createPurchaseReturn } from "../services/purchases.service.js";
import { postGroceryPurchaseReturnAccounting, postGroceryRefundAccounting, postGrocerySalesReturnFinancials } from "../services/grocery-31-40-reversals.service.js";
import { writeAudit } from "../services/audit.service.js";

const db: any = prisma;
const text = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const qty = (v: unknown) => Math.round((num(v) + Number.EPSILON) * 1000) / 1000;
const json = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
function tenant(req: Request) { const businessId = req.tenant?.businessId, userId = req.tenant?.userId; if (!businessId || !userId) throw new Error("Authenticated Grocery tenant is required"); return { businessId, userId }; }
function capture() { let statusCode = 200, payload: any = null; const response: any = { status(code: number) { statusCode = code; return this; }, json(body: any) { payload = body; return this; } }; return { response: response as Response, read: () => ({ statusCode, payload }) }; }

export async function grocerySalesReturnCreate(req: Request, res: Response) {
  try {
    const t = tenant(req), reason = text(req.body?.reason); if (!reason) return res.status(422).json({ ok: false, error: { code: "RETURN_REASON_REQUIRED", message: "Return reason is required" } });
    const cap = capture(); await createSalesReturn(req, cap.response); const result = cap.read();
    if (!result.payload?.ok || !result.payload?.data?.id) return res.status(result.statusCode).json(result.payload);
    let accounting: any = json(result.payload.data.metadata).accounting || null;
    if (!accounting?.posted) {
      accounting = await db.$transaction((tx: any) => postGrocerySalesReturnFinancials(tx, { businessId: t.businessId, userId: t.userId, salesReturnId: result.payload.data.id }));
      await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.sales_return.accounting_reversal", entityType: "SalesReturn", entityId: result.payload.data.id, after: accounting });
    }
    result.payload.data.accounting = accounting; return res.status(result.statusCode).json(result.payload);
  } catch (e: any) { return res.status(400).json({ ok: false, error: { message: e?.message || "Failed to post Grocery sales return" } }); }
}

export async function groceryRefundCreate(req: Request, res: Response) {
  try {
    const t = tenant(req), reason = text(req.body?.reason); if (!reason) return res.status(422).json({ ok: false, error: { code: "REFUND_REASON_REQUIRED", message: "Refund reason is required" } });
    const rawMethod = text(req.body?.method || req.body?.paymentMethod).toLowerCase(); if (["customer account", "customer_account", "customer credit", "customer_credit"].includes(rawMethod)) req.body.method = "store credit";
    const cap = capture(); await createRefund(req, cap.response); const result = cap.read();
    if (!result.payload?.ok || !result.payload?.data?.id) return res.status(result.statusCode).json(result.payload);
    const accounting = await db.$transaction((tx: any) => postGroceryRefundAccounting(tx, { businessId: t.businessId, userId: t.userId, refundId: result.payload.data.id }));
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.refund.accounting_settlement", entityType: "CustomerRefund", entityId: result.payload.data.id, after: accounting });
    result.payload.data.accounting = accounting; return res.status(result.statusCode).json(result.payload);
  } catch (e: any) { return res.status(400).json({ ok: false, error: { message: e?.message || "Failed to post Grocery refund" } }); }
}

export async function groceryPurchaseReturnCreate(req: Request, res: Response) {
  try {
    const t = tenant(req), reason = text(req.body?.reason), purchaseId = text(req.body?.purchaseId);
    if (!reason) return res.status(422).json({ ok: false, error: { code: "RETURN_REASON_REQUIRED", message: "Purchase return reason is required" } });
    if (!purchaseId) return res.status(422).json({ ok: false, error: { code: "SOURCE_PURCHASE_REQUIRED", message: "Original purchase is required for a Grocery purchase return" } });
    const purchase = await db.purchase.findFirst({ where: { id: purchaseId, businessId: t.businessId }, include: { items: true, returns: { include: { items: true } } } });
    if (!purchase) return res.status(404).json({ ok: false, error: { code: "PURCHASE_NOT_FOUND", message: "Original purchase not found" } });
    const sourceByProduct = new Map<string, any>(), sourceBySku = new Map<string, any>();
    for (const item of purchase.items || []) { if (item.productId) sourceByProduct.set(String(item.productId), item); if (item.sku) sourceBySku.set(String(item.sku).toLowerCase(), item); }
    const previous = new Map<string, number>();
    for (const ret of purchase.returns || []) for (const item of ret.items || []) { const key = item.productId ? `p:${item.productId}` : `s:${String(item.sku || "").toLowerCase()}`; previous.set(key, qty((previous.get(key) || 0) + num(item.qty))); }
    const requested = new Map<string, number>();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(422).json({ ok: false, error: { code: "RETURN_ITEMS_REQUIRED", message: "Purchase return items are required" } });
    for (const raw of items) {
      const source = (raw.productId && sourceByProduct.get(String(raw.productId))) || (raw.sku && sourceBySku.get(String(raw.sku).toLowerCase()));
      if (!source) return res.status(422).json({ ok: false, error: { code: "RETURN_ITEM_NOT_PURCHASED", message: "One return item is not on the original purchase" } });
      const key = source.productId ? `p:${source.productId}` : `s:${String(source.sku || "").toLowerCase()}`, amount = qty(raw.qty ?? raw.quantity), cumulative = qty((requested.get(key) || 0) + amount), already = previous.get(key) || 0, remaining = qty(Math.max(0, num(source.qty) - already));
      if (amount <= 0) return res.status(422).json({ ok: false, error: { code: "INVALID_RETURN_QTY", message: `${source.name}: return quantity must be positive` } });
      if (cumulative > remaining + .0001) return res.status(409).json({ ok: false, error: { code: "PURCHASE_RETURN_QTY_EXCEEDED", message: `${source.name}: return quantity exceeds remaining purchased quantity ${remaining}` } });
      requested.set(key, cumulative); raw.productId = source.productId; raw.sku = source.sku; raw.name = raw.name || source.name; raw.cost = raw.cost ?? source.cost;
    }
    const row: any = await createPurchaseReturn(req, t.businessId, t.userId, { ...req.body, reason, purchaseId, supplierId: purchase.supplierId, supplierName: purchase.supplierName, warehouseId: req.body?.warehouseId || purchase.warehouseId, items });
    const accounting = await db.$transaction((tx: any) => postGroceryPurchaseReturnAccounting(tx, { businessId: t.businessId, userId: t.userId, purchaseReturnId: row.id }));
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.purchase_return.accounting_reversal", entityType: "PurchaseReturn", entityId: row.id, after: accounting });
    return res.status(201).json({ ok: true, data: { ...row, accounting } });
  } catch (e: any) { return res.status(400).json({ ok: false, error: { message: e?.message || "Failed to post Grocery purchase return" } }); }
}
