import crypto from "node:crypto";
import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "./audit.service.js";
import { nextEntityNumber } from "./numbering.service.js";
import { readGroceryProductProfile } from "../controllers/grocery-product-uom.controller.js";

const db: any = prisma;
const DAY = 86_400_000;
const INVALID_SALES = ["DRAFT", "CANCELLED", "VOID"];
const text = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown, f = 0) => { const n = Number(v); return Number.isFinite(n) ? n : f; };
const money = (v: unknown) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const qty = (v: unknown) => Math.round((num(v) + Number.EPSILON) * 1000) / 1000;
const json = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const limitOf = (v: unknown, d = 50, max = 250) => Math.max(1, Math.min(max, Math.trunc(num(v, d))));
const pageOf = (v: unknown) => Math.max(1, Math.trunc(num(v, 1)));
const bool = (v: unknown, f = false) => v === undefined || v === null || v === "" ? f : typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
const asDate = (v: unknown) => { if (!v) return null; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d; };

export const GROCERY_41_50_MODULES = [
  "stock-valuation", "printing", "barcode-shelf-labels", "dashboard-improvement", "notification-center",
  "settings", "market-standard-completion", "bulk-import-export", "global-search", "performance-controls",
] as const;

export const GROCERY_PRINT_TEMPLATES = [
  "sales_receipt", "tax_invoice", "credit_invoice", "quotation", "sales_return", "customer_payment_receipt",
  "customer_statement", "purchase_order", "grn", "purchase_invoice", "purchase_return", "supplier_payment_voucher",
  "receipt_voucher", "payment_voucher", "stock_transfer", "stock_count", "expense_voucher", "journal_voucher",
] as const;

export const GROCERY_SETTING_DEFAULTS: Record<string, any> = {
  "grocery.business.logo": null,
  "grocery.business.address": "",
  "grocery.business.contact": "",
  "grocery.pos.defaultCustomerId": null,
  "grocery.pos.defaultWarehouseId": null,
  "grocery.pos.defaultCounterId": null,
  "grocery.pos.receiptSize": "80mm",
  "grocery.pos.allowNegativeStock": false,
  "grocery.pos.rounding": 0.01,
  "grocery.pos.defaultPaymentMethod": "cash",
  "grocery.pos.allowHoldSale": true,
  "grocery.pos.sound": true,
  "grocery.pos.barcodeBehavior": "scan_and_add",
  "grocery.sales.invoicePrefix": "INV",
  "grocery.sales.quotationPrefix": "QUO",
  "grocery.sales.paymentTermsDays": 0,
  "grocery.sales.enforceCreditLimit": true,
  "grocery.sales.defaultDueDays": 0,
  "grocery.sales.allowDiscounts": true,
  "grocery.sales.allowReturns": true,
  "grocery.purchases.poPrefix": "PO",
  "grocery.purchases.grnPrefix": "GRN",
  "grocery.purchases.invoicePrefix": "PINV",
  "grocery.purchases.supplierPaymentTermsDays": 30,
  "grocery.purchases.approvalLevel": 0,
  "grocery.inventory.valuationMethod": "weighted_average",
  "grocery.inventory.batchTracking": true,
  "grocery.inventory.expiryTracking": true,
  "grocery.inventory.allowNegative": false,
  "grocery.inventory.reorderEnabled": true,
  "grocery.inventory.fefo": true,
  "grocery.inventory.countApprovalRequired": true,
  "grocery.accounting.fiscalYearStartMonth": 1,
  "grocery.accounting.basis": "accrual",
  "grocery.printing.receiptPaper": "80mm",
  "grocery.printing.invoiceTemplate": "standard",
  "grocery.printing.footer": "",
  "grocery.printing.printerPreference": "browser",
  "grocery.printing.copies": 1,
  "grocery.notifications.expiryDays": 30,
  "grocery.notifications.customerDueDays": 7,
  "grocery.notifications.supplierDueDays": 7,
  "grocery.notifications.lowStockThreshold": 0,
  "grocery.notifications.chequeReminderDays": 7,
  "grocery.notifications.largeDiscountAmount": 100,
  "grocery.notifications.largeRefundAmount": 100,
};

export async function assertGrocery(businessId: string) {
  const selected = await db.businessIndustry.findUnique({ where: { businessId }, include: { industry: { select: { code: true } } } });
  if (text(selected?.industry?.code).toLowerCase() !== "grocery") throw new Error("Grocery tenant is required");
}

export async function weightedAverageCosts(businessId: string, productIds: string[]) {
  const ids = [...new Set(productIds.map(text).filter(Boolean))].slice(0, 500);
  const out = new Map<string, { quantity: number; averageCost: number; stockValue: number }>();
  if (!ids.length) return out;
  const rows: any[] = await db.$queryRawUnsafe(
    `SELECT product_id AS "productId",
            COALESCE(SUM(qty_on_hand_base),0)::float8 AS quantity,
            COALESCE(SUM(qty_on_hand_base * cost_per_base_unit),0)::float8 AS value
       FROM inventory_batches
      WHERE business_id = $1
        AND product_id = ANY($2::text[])
        AND qty_on_hand_base > 0
        AND status NOT IN ('depleted','quarantined')
      GROUP BY product_id`, businessId, ids,
  );
  for (const row of rows) {
    const quantity = num(row.quantity), stockValue = money(row.value);
    out.set(String(row.productId), { quantity, stockValue, averageCost: quantity > 0 ? money(stockValue / quantity) : 0 });
  }
  return out;
}

export async function stockValuation(businessId: string, query: any = {}) {
  await assertGrocery(businessId);
  const page = pageOf(query.page), limit = limitOf(query.limit ?? query.pageSize, 50, 250), offset = (page - 1) * limit;
  const q = text(query.q || query.search), warehouseId = text(query.warehouseId);
  const params: any[] = [businessId]; let idx = 2;
  let warehouseSql = "", searchSql = "";
  if (warehouseId) { warehouseSql = ` AND b.warehouse_id = $${idx++}`; params.push(warehouseId); }
  if (q) { searchSql = ` AND (p.name ILIKE $${idx} OR p.sku ILIKE $${idx} OR COALESCE(p.barcode,'') ILIKE $${idx})`; params.push(`%${q}%`); idx += 1; }
  const limitPos = idx++, offsetPos = idx++; params.push(limit, offset);
  const rows: any[] = await db.$queryRawUnsafe(
    `SELECT p.id AS "productId", p.sku, p.name, p.category, p.unit,
            COALESCE(SUM(b.qty_on_hand_base),0)::float8 AS quantity,
            COALESCE(SUM(b.qty_on_hand_base * b.cost_per_base_unit),0)::float8 AS "stockValue"
       FROM products p
       JOIN inventory_batches b ON b.product_id=p.id AND b.business_id=p.business_id
      WHERE p.business_id=$1 AND p.deleted=false AND b.qty_on_hand_base>0
        AND b.status NOT IN ('depleted','quarantined')${warehouseSql}${searchSql}
      GROUP BY p.id,p.sku,p.name,p.category,p.unit
      ORDER BY p.name ASC
      LIMIT $${limitPos} OFFSET $${offsetPos}`, ...params,
  );
  const countParams = params.slice(0, params.length - 2);
  const countRows: any[] = await db.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT p.id FROM products p JOIN inventory_batches b ON b.product_id=p.id AND b.business_id=p.business_id
        WHERE p.business_id=$1 AND p.deleted=false AND b.qty_on_hand_base>0
          AND b.status NOT IN ('depleted','quarantined')${warehouseSql}${searchSql}
        GROUP BY p.id
     ) x`, ...countParams,
  );
  const totalRows = Number(countRows[0]?.count || 0);
  const totalRowsValue: any[] = await db.$queryRawUnsafe(
    `SELECT COALESCE(SUM(qty_on_hand_base * cost_per_base_unit),0)::float8 AS value,
            COALESCE(SUM(qty_on_hand_base),0)::float8 AS quantity
       FROM inventory_batches
      WHERE business_id=$1 AND qty_on_hand_base>0 AND status NOT IN ('depleted','quarantined')${warehouseId ? " AND warehouse_id=$2" : ""}`,
    ...(warehouseId ? [businessId, warehouseId] : [businessId]),
  );
  return {
    method: "weighted_average",
    physicalRotation: "FEFO",
    rows: rows.map(r => ({ ...r, quantity: qty(r.quantity), stockValue: money(r.stockValue), averageCost: num(r.quantity) > 0 ? money(num(r.stockValue) / num(r.quantity)) : 0 })),
    summary: { quantity: qty(totalRowsValue[0]?.quantity), stockValue: money(totalRowsValue[0]?.value) },
    meta: { page, pageSize: limit, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / limit)) },
  };
}

export async function syncWeightedAverageProductCosts(req: Request, businessId: string, userId: string | null, productIds?: string[]) {
  await assertGrocery(businessId);
  let ids = [...new Set((productIds || []).map(text).filter(Boolean))];
  if (!ids.length) {
    const rows = await db.product.findMany({ where: { businessId, deleted: false }, select: { id: true }, take: 10000 });
    ids = rows.map((r: any) => String(r.id));
  }
  if (ids.length > 10000) throw new Error("Valuation synchronization is limited to 10,000 products per request");
  const costs = await weightedAverageCosts(businessId, ids);
  let updated = 0;
  await db.$transaction(async (tx: any) => {
    for (const id of ids) {
      const cost = costs.get(id)?.averageCost;
      if (cost === undefined) continue;
      await tx.product.updateMany({ where: { id, businessId }, data: { costPrice: cost } });
      updated += 1;
    }
    await writeAudit(tx, req, { businessId, userId, action: "grocery.valuation.weighted_average_sync", entityType: "Product", after: { method: "weighted_average", updated } });
  });
  return { method: "weighted_average", updated };
}

export async function purchaseCostHistory(businessId: string, productId: string, query: any = {}) {
  await assertGrocery(businessId);
  const product = await db.product.findFirst({ where: { id: productId, businessId, deleted: false }, select: { id: true, sku: true, name: true } });
  if (!product) throw new Error("Product not found");
  const page = pageOf(query.page), limit = limitOf(query.limit ?? query.pageSize, 50, 200);
  const [rows, total] = await Promise.all([
    db.goodsReceiptItem.findMany({
      where: { businessId, productId },
      include: { goodsReceipt: { include: { purchase: { select: { purchaseNo: true, supplierId: true, supplierName: true, purchaseDate: true } } } } },
      orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
    }),
    db.goodsReceiptItem.count({ where: { businessId, productId } }),
  ]);
  return { product, rows: rows.map((r: any) => ({ receivedAt: r.createdAt, receiptNo: r.goodsReceipt?.receiptNo, purchaseNo: r.goodsReceipt?.purchase?.purchaseNo, supplierId: r.goodsReceipt?.purchase?.supplierId, supplier: r.goodsReceipt?.purchase?.supplierName, quantity: qty(r.qty), purchaseUnitCost: money(r.cost) })), meta: { page, pageSize: limit, totalRows: total } };
}

function printDefaults(code: string, documentType: string, paperSize: string, widthMm: number | null = null) {
  return { code, name: code.replaceAll("_", " ").replace(/\b\w/g, m => m.toUpperCase()), documentType, paperSize, widthMm, heightMm: null, marginTopMm: paperSize.endsWith("mm") ? 3 : 8, marginRightMm: paperSize.endsWith("mm") ? 3 : 8, marginBottomMm: paperSize.endsWith("mm") ? 3 : 8, marginLeftMm: paperSize.endsWith("mm") ? 3 : 8, fontScale: 1, bilingual: false, copies: ["Original"], isDefault: true, active: true, config: { showLogo: true, showAddress: true, showPhone: true, showTaxNumber: true, showQr: true, showBarcode: true, showCashier: true, showCounter: true, showCustomer: true, showInvoiceNumber: true, showTaxSummary: true, footer: "", terms: "" } };
}

export async function ensurePrintProfiles(businessId: string, userId: string | null) {
  const defaults = [printDefaults("thermal_58", "sales_receipt", "58mm", 58), printDefaults("thermal_80", "sales_receipt", "80mm", 80), printDefaults("a5_standard", "document", "A5"), printDefaults("a4_standard", "document", "A4"), printDefaults("letter_standard", "document", "Letter")];
  for (const row of defaults) await db.printProfile.upsert({ where: { businessId_code: { businessId, code: row.code } }, create: { businessId, ...row, createdByUserId: userId, updatedByUserId: userId }, update: {} });
}

export async function listPrintProfiles(businessId: string, userId: string | null) {
  await assertGrocery(businessId); await ensurePrintProfiles(businessId, userId);
  return { templates: [...GROCERY_PRINT_TEMPLATES], paperSizes: ["58mm", "80mm", "A5", "A4", "Letter"], profiles: await db.printProfile.findMany({ where: { businessId, active: true }, orderBy: [{ documentType: "asc" }, { code: "asc" }] }) };
}

export async function savePrintProfile(req: Request, businessId: string, userId: string | null, code: string, input: any) {
  await assertGrocery(businessId); code = text(code); if (!code) throw new Error("Print profile code is required");
  const paperSize = text(input.paperSize || "A4"); if (!["58mm", "80mm", "A5", "A4", "Letter"].includes(paperSize)) throw new Error("Unsupported paper size");
  const documentType = text(input.documentType || "document");
  const before = await db.printProfile.findUnique({ where: { businessId_code: { businessId, code } } });
  const row = await db.printProfile.upsert({ where: { businessId_code: { businessId, code } }, create: { businessId, code, name: text(input.name) || code, documentType, paperSize, widthMm: paperSize === "58mm" ? 58 : paperSize === "80mm" ? 80 : null, heightMm: input.heightMm == null ? null : num(input.heightMm), marginTopMm: Math.max(0, num(input.marginTopMm, 8)), marginRightMm: Math.max(0, num(input.marginRightMm, 8)), marginBottomMm: Math.max(0, num(input.marginBottomMm, 8)), marginLeftMm: Math.max(0, num(input.marginLeftMm, 8)), fontScale: Math.max(.5, Math.min(2, num(input.fontScale, 1))), bilingual: bool(input.bilingual), copies: Array.isArray(input.copies) && input.copies.length ? input.copies.map(text).filter(Boolean) : ["Original"], isDefault: bool(input.isDefault), active: input.active === undefined ? true : bool(input.active), config: json(input.config), createdByUserId: userId, updatedByUserId: userId }, update: { name: text(input.name) || code, documentType, paperSize, widthMm: paperSize === "58mm" ? 58 : paperSize === "80mm" ? 80 : null, heightMm: input.heightMm == null ? null : num(input.heightMm), marginTopMm: Math.max(0, num(input.marginTopMm, 8)), marginRightMm: Math.max(0, num(input.marginRightMm, 8)), marginBottomMm: Math.max(0, num(input.marginBottomMm, 8)), marginLeftMm: Math.max(0, num(input.marginLeftMm, 8)), fontScale: Math.max(.5, Math.min(2, num(input.fontScale, 1))), bilingual: bool(input.bilingual), copies: Array.isArray(input.copies) && input.copies.length ? input.copies.map(text).filter(Boolean) : ["Original"], isDefault: bool(input.isDefault), active: input.active === undefined ? true : bool(input.active), config: json(input.config), updatedByUserId: userId } });
  await writeAudit(db, req, { businessId, userId, action: "grocery.print_profile.save", entityType: "PrintProfile", entityId: row.id, before: before || undefined, after: row });
  return row;
}

async function businessPrintIdentity(businessId: string) {
  const [business, settings] = await Promise.all([db.business.findUnique({ where: { id: businessId } }), db.appSetting.findMany({ where: { businessId, key: { startsWith: "grocery." } } })]);
  const values = Object.fromEntries(settings.map((s: any) => [s.key, s.value]));
  return { name: business?.name, legalName: business?.legalName, address: values["grocery.business.address"] || "", phone: values["grocery.business.contact"] || "", taxNumber: business?.taxNumber, currency: business?.currency || "QAR", timezone: business?.timezone || "Asia/Qatar", logo: values["grocery.business.logo"] || null, footer: values["grocery.printing.footer"] || "" };
}

export async function printableDocument(businessId: string, type: string, id: string) {
  await assertGrocery(businessId); type = text(type).toLowerCase(); id = text(id); if (!id) throw new Error("Document id is required");
  let document: any = null;
  if (["sales_receipt", "tax_invoice", "credit_invoice", "quotation"].includes(type)) document = await db.salesDocument.findFirst({ where: { id, businessId }, include: { items: true } });
  else if (type === "sales_return") document = await db.salesReturn.findFirst({ where: { id, businessId }, include: { items: true, sourceSalesDocument: { select: { documentNo: true } } } });
  else if (["customer_payment_receipt", "receipt_voucher"].includes(type)) document = await db.customerPayment.findFirst({ where: { id, businessId } });
  else if (type === "customer_statement") { const customer = await db.customer.findFirst({ where: { id, businessId } }); if (customer) { const [sales, payments] = await Promise.all([db.salesDocument.findMany({ where: { businessId, customerId: id, documentType: "INVOICE" }, orderBy: { createdAt: "desc" }, take: 500 }), db.customerPayment.findMany({ where: { businessId, customerId: id }, orderBy: { paymentDate: "desc" }, take: 500 })]); document = { customer, sales, payments }; } }
  else if (["purchase_order", "purchase_invoice"].includes(type)) document = await db.purchase.findFirst({ where: { id, businessId }, include: { items: true } });
  else if (type === "grn") document = await db.goodsReceipt.findFirst({ where: { id, businessId }, include: { items: true, purchase: { select: { purchaseNo: true, supplierName: true } } } });
  else if (type === "purchase_return") document = await db.purchaseReturn.findFirst({ where: { id, businessId }, include: { items: true } });
  else if (["supplier_payment_voucher", "payment_voucher"].includes(type)) document = await db.supplierPayment.findFirst({ where: { id, businessId } });
  else if (type === "stock_count") document = await db.stockCount.findFirst({ where: { id, businessId }, include: { items: true } });
  else if (type === "expense_voucher") document = await db.expense.findFirst({ where: { id, businessId } });
  else if (["stock_transfer", "journal_voucher"].includes(type)) document = await db.industryRecord.findFirst({ where: { id, businessId, industryCode: "grocery" } });
  if (!document) throw new Error("Printable document not found");
  return { type, business: await businessPrintIdentity(businessId), document };
}

export async function labelPreview(businessId: string, input: any) {
  await assertGrocery(businessId);
  const ids = [...new Set((Array.isArray(input.productIds) ? input.productIds : input.productId ? [input.productId] : []).map(text).filter(Boolean))].slice(0, 100);
  if (!ids.length) throw new Error("At least one product is required");
  const perProduct = Math.max(1, Math.min(100, Math.trunc(num(input.quantity, 1))));
  if (ids.length * perProduct > 500) throw new Error("A label preview is limited to 500 labels");
  const type = text(input.labelType || "product_barcode"); if (!["product_barcode", "shelf_label", "price_label"].includes(type)) throw new Error("Unsupported label type");
  const barcodeType = text(input.barcodeType || "CODE128").toUpperCase(); if (!["CODE128", "EAN13", "EAN8", "UPC", "QR"].includes(barcodeType)) throw new Error("Unsupported barcode type");
  const products = await db.product.findMany({ where: { businessId, id: { in: ids }, deleted: false, active: true } });
  const labels: any[] = [];
  for (const p of products) {
    const gp = readGroceryProductProfile(p); const value = p.barcode || gp.barcodes[0] || p.sku;
    for (let i = 0; i < perProduct; i += 1) labels.push({ type, productId: p.id, name: p.name, sku: p.sku, barcode: value, barcodeType, unit: gp.baseUnit || p.unit, price: bool(input.showPrice, true) ? Number(p.price) : null, promotionalPrice: gp.promotionalPrice > 0 ? gp.promotionalPrice : null, dimensions: { widthMm: Math.max(20, Math.min(150, num(input.widthMm, type === "shelf_label" ? 70 : 50))), heightMm: Math.max(15, Math.min(100, num(input.heightMm, type === "shelf_label" ? 35 : 30))) } });
  }
  return { labels, count: labels.length, printerFriendly: true };
}

function qatarDayBounds(date = new Date()) { const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); return { key, from: new Date(`${key}T00:00:00.000+03:00`), to: new Date(`${key}T23:59:59.999+03:00`) }; }
async function saleTotals(businessId: string, from: Date, to: Date) {
  const docs = await db.salesDocument.findMany({ where: { businessId, documentType: "INVOICE", status: { notIn: INVALID_SALES }, createdAt: { gte: from, lte: to } }, select: { total: true, metadata: true } });
  const sales = money(docs.reduce((s: number, d: any) => s + num(d.total), 0));
  const cogs = money(docs.reduce((s: number, d: any) => s + num(json(d.metadata).groceryCostSnapshot?.totalCogs), 0));
  return { sales, cogs, profit: money(sales - cogs), count: docs.length };
}
function comparison(current: number, previous: number) { if (Math.abs(previous) < 0.000001) return { previous: money(previous), difference: money(current - previous), changePct: null, valid: false }; return { previous: money(previous), difference: money(current - previous), changePct: money((current - previous) / Math.abs(previous) * 100), valid: true }; }

export async function groceryDashboard41To50(businessId: string) {
  await assertGrocery(businessId); const today = qatarDayBounds(), yesterdayDate = new Date(today.from.getTime() - DAY), yesterday = qatarDayBounds(yesterdayDate), weekFrom = new Date(today.from.getTime() - 7 * DAY), priorWeekFrom = new Date(today.from.getTime() - 14 * DAY);
  const [todaySales, yesterdaySales, thisWeekSales, priorWeekSales, purchases, expenses, receivables, payables, lowStock, expiring, overdueCustomers, supplierDue, chequesDue, accounts, valuation, trendDocs, topDocs] = await Promise.all([
    saleTotals(businessId, today.from, today.to), saleTotals(businessId, yesterday.from, yesterday.to), saleTotals(businessId, weekFrom, today.to), saleTotals(businessId, priorWeekFrom, new Date(weekFrom.getTime() - 1)),
    db.purchase.aggregate({ where: { businessId, purchaseDate: { gte: today.from, lte: today.to }, status: { not: "CANCELLED" } }, _sum: { total: true } }),
    db.expense.aggregate({ where: { businessId, expenseDate: { gte: today.from, lte: today.to } }, _sum: { amount: true } }),
    db.customer.aggregate({ where: { businessId, active: true, balance: { gt: 0 } }, _sum: { balance: true } }), db.supplier.aggregate({ where: { businessId, active: true, balance: { gt: 0 } }, _sum: { balance: true } }),
    db.product.count({ where: { businessId, deleted: false, active: true, currentStock: { lte: db.product.fields?.minStock || undefined } } }).catch(() => 0),
    db.inventoryBatch.count({ where: { businessId, qtyOnHandBase: { gt: 0 }, expiryDate: { gte: today.from, lte: new Date(today.from.getTime() + 30 * DAY) }, status: { notIn: ["depleted", "quarantined"] } } }),
    db.salesDocument.count({ where: { businessId, documentType: "INVOICE", balance: { gt: 0 }, dueDate: { lt: today.from }, status: { notIn: INVALID_SALES } } }),
    db.purchase.count({ where: { businessId, balance: { gt: 0 }, dueDate: { lte: new Date(today.from.getTime() + 7 * DAY) }, status: { not: "CANCELLED" } } }),
    db.industryRecord.count({ where: { businessId, industryCode: "grocery", entityType: "grocery_cheque", dueAt: { lte: new Date(today.from.getTime() + 7 * DAY) }, status: { notIn: ["cleared", "cancelled", "replaced"] } } }),
    db.account.findMany({ where: { businessId, active: true }, select: { type: true, currentBalance: true } }), stockValuation(businessId, { page: 1, limit: 1 }),
    db.salesDocument.findMany({ where: { businessId, documentType: "INVOICE", status: { notIn: INVALID_SALES }, createdAt: { gte: new Date(today.from.getTime() - 13 * DAY), lte: today.to } }, select: { createdAt: true, total: true, paymentMethod: true, metadata: true }, orderBy: { createdAt: "asc" }, take: 10000 }),
    db.salesDocument.findMany({ where: { businessId, documentType: "INVOICE", status: { notIn: INVALID_SALES }, createdAt: { gte: new Date(today.from.getTime() - 30 * DAY), lte: today.to } }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 5000 }),
  ]);
  const trend = new Map<string, any>(), payments = new Map<string, number>();
  for (const d of trendDocs) { const k = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(d.createdAt); const row = trend.get(k) || { date: k, sales: 0, profit: 0 }; const cogs = num(json(d.metadata).groceryCostSnapshot?.totalCogs); row.sales += num(d.total); row.profit += num(d.total) - cogs; trend.set(k, row); const pm = text(d.paymentMethod || "other").toLowerCase(); payments.set(pm, (payments.get(pm) || 0) + num(d.total)); }
  const productTotals = new Map<string, any>(), categoryTotals = new Map<string, number>(), customerTotals = new Map<string, number>();
  const productIds = [...new Set(topDocs.flatMap((d: any) => d.items.map((i: any) => i.productId).filter(Boolean)))]; const products = productIds.length ? await db.product.findMany({ where: { businessId, id: { in: productIds } }, select: { id: true, category: true } }) : []; const catMap = new Map(products.map((p: any) => [String(p.id), p.category || "Uncategorized"]));
  for (const d of topDocs) { customerTotals.set(d.customerName || "Walk-in Customer", (customerTotals.get(d.customerName || "Walk-in Customer") || 0) + num(d.total)); for (const i of d.items) { const key = String(i.productId || i.sku || i.name), r = productTotals.get(key) || { product: i.name, quantity: 0, sales: 0 }; r.quantity += num(i.qty); r.sales += num(i.total); productTotals.set(key, r); const cat = catMap.get(String(i.productId)) || "Uncategorized"; categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + num(i.total)); } }
  const cashTypes = ["cash", "bank", "asset"]; const netCash = money(accounts.filter((a: any) => cashTypes.some(x => text(a.type).toLowerCase().includes(x))).reduce((s: number, a: any) => s + num(a.currentBalance), 0));
  return { cards: { todaySales: todaySales.sales, todayProfit: todaySales.profit, todayPurchases: money(purchases._sum.total), todayExpenses: money(expenses._sum.amount), netCash, receivables: money(receivables._sum.balance), payables: money(payables._sum.balance), currentStockValue: valuation.summary.stockValue, lowStock, expiringProducts: expiring, overdueCustomers, supplierBillsDue: supplierDue, chequesDue }, comparisons: { salesVsYesterday: comparison(todaySales.sales, yesterdaySales.sales), profitVsYesterday: comparison(todaySales.profit, yesterdaySales.profit), salesVsLastWeek: comparison(thisWeekSales.sales, priorWeekSales.sales) }, charts: { salesTrend: [...trend.values()].map(r => ({ ...r, sales: money(r.sales), profit: money(r.profit) })), paymentMethods: [...payments].map(([name, value]) => ({ name, value: money(value) })), categories: [...categoryTotals].map(([name, value]) => ({ name, value: money(value) })).sort((a,b) => b.value-a.value).slice(0,10), topProducts: [...productTotals.values()].sort((a,b) => b.sales-a.sales).slice(0,10).map(r => ({ ...r, quantity: qty(r.quantity), sales: money(r.sales) })), topCustomers: [...customerTotals].map(([name,value]) => ({ name, value: money(value) })).sort((a,b) => b.value-a.value).slice(0,10) }, meta: { timezone: "Asia/Qatar", generatedAt: new Date().toISOString(), chartDocumentCaps: { trend: 10000, top: 5000 } } };
}

async function settingMap(businessId: string) { const rows = await db.appSetting.findMany({ where: { businessId, key: { startsWith: "grocery." } } }); return new Map(rows.map((r: any) => [String(r.key), r.value])); }
export async function grocerySettings(businessId: string) {
  await assertGrocery(businessId); const [business, rows] = await Promise.all([db.business.findUnique({ where: { id: businessId } }), db.appSetting.findMany({ where: { businessId, key: { startsWith: "grocery." } }, orderBy: { key: "asc" } })]); const values = { ...GROCERY_SETTING_DEFAULTS, ...Object.fromEntries(rows.map((r: any) => [r.key, r.value])) };
  return { business: { name: business?.name, legalName: business?.legalName, taxId: business?.taxNumber, timezone: business?.timezone, currency: business?.currency, dateFormat: business?.dateFormat }, values, groups: ["business", "pos", "sales", "purchases", "inventory", "accounting", "printing", "notifications"] };
}
function validateSetting(key: string, value: any) {
  if (!(key in GROCERY_SETTING_DEFAULTS) && !key.startsWith("grocery.accounting.defaultAccount.")) throw new Error(`Unsupported Grocery setting: ${key}`);
  if (key === "grocery.inventory.valuationMethod" && value !== "weighted_average") throw new Error("This Grocery implementation uses Weighted Average valuation; changing methods after transactions is not allowed");
  if (key === "grocery.pos.receiptSize" && !["58mm", "80mm", "A5", "A4", "Letter"].includes(text(value))) throw new Error("Unsupported receipt size");
  if (key.includes("Days") && num(value) < 0) throw new Error(`${key} cannot be negative`);
  return value;
}
export async function saveGrocerySettings(req: Request, businessId: string, userId: string | null, input: any) {
  await assertGrocery(businessId); const values = json(input.values || input); const businessInput = json(input.business); const saved: string[] = [];
  return db.$transaction(async (tx: any) => {
    for (const [key, raw] of Object.entries(values)) { const value = validateSetting(key, raw); await tx.appSetting.upsert({ where: { businessId_key: { businessId, key } }, create: { businessId, key, value }, update: { value } }); saved.push(key); }
    const businessPatch: any = {}; if (businessInput.name !== undefined) businessPatch.name = text(businessInput.name); if (businessInput.taxId !== undefined) businessPatch.taxNumber = text(businessInput.taxId) || null; if (businessInput.timezone !== undefined) businessPatch.timezone = text(businessInput.timezone) || "Asia/Qatar"; if (businessInput.currency !== undefined) businessPatch.currency = text(businessInput.currency).toUpperCase() || "QAR"; if (businessInput.dateFormat !== undefined) businessPatch.dateFormat = text(businessInput.dateFormat) || "yyyy-MM-dd"; if (Object.keys(businessPatch).length) await tx.business.update({ where: { id: businessId }, data: businessPatch });
    await writeAudit(tx, req, { businessId, userId, action: "grocery.settings.save", entityType: "AppSetting", after: { keys: saved, business: Object.keys(businessPatch) } }); return { saved, business: businessPatch };
  });
}

export async function listNotificationRules(businessId: string) { await assertGrocery(businessId); return db.notificationRule.findMany({ where: { businessId }, orderBy: { code: "asc" } }); }
export async function saveNotificationRule(req: Request, businessId: string, userId: string | null, code: string, input: any) {
  await assertGrocery(businessId); code = text(code); if (!code) throw new Error("Rule code is required"); const row = await db.notificationRule.upsert({ where: { businessId_code: { businessId, code } }, create: { businessId, code, name: text(input.name) || code, eventType: text(input.eventType) || code, channels: ["in_app"], schedule: input.schedule || null, conditions: json(input.conditions), template: json(input.template), quietHours: input.quietHours || null, active: input.active === undefined ? true : bool(input.active), createdByUserId: userId, updatedByUserId: userId }, update: { name: text(input.name) || code, eventType: text(input.eventType) || code, schedule: input.schedule || null, conditions: json(input.conditions), template: json(input.template), quietHours: input.quietHours || null, active: input.active === undefined ? true : bool(input.active), updatedByUserId: userId } }); await writeAudit(db, req, { businessId, userId, action: "grocery.notification_rule.save", entityType: "NotificationRule", entityId: row.id, after: row }); return row;
}

async function upsertOperationalNotification(tx: any, businessId: string, type: string, title: string, message: string, entityType: string, entityId: string) {
  const existing = await tx.notification.findFirst({ where: { businessId, type, entityType, entityId, readAt: null, title } }); if (existing) return existing;
  return tx.notification.create({ data: { businessId, type, title, message, entityType, entityId } });
}
export async function generateOperationalNotifications(req: Request, businessId: string, userId: string | null) {
  await assertGrocery(businessId); const settings = await settingMap(businessId), now = new Date(), expiryDays = Math.max(0, num(settings.get("grocery.notifications.expiryDays"), 30)), customerDays = Math.max(0, num(settings.get("grocery.notifications.customerDueDays"), 7)), supplierDays = Math.max(0, num(settings.get("grocery.notifications.supplierDueDays"), 7)), chequeDays = Math.max(0, num(settings.get("grocery.notifications.chequeReminderDays"), 7)), largeDiscount = Math.max(0, num(settings.get("grocery.notifications.largeDiscountAmount"), 100)), largeRefund = Math.max(0, num(settings.get("grocery.notifications.largeRefundAmount"), 100));
  const [products, batches, customerDue, supplierDue, cheques, pendingPo, transfers, counts, discounts, refunds] = await Promise.all([
    db.product.findMany({ where: { businessId, deleted: false, active: true }, select: { id: true, name: true, sku: true, currentStock: true, minStock: true }, take: 5000 }),
    db.inventoryBatch.findMany({ where: { businessId, qtyOnHandBase: { gt: 0 }, expiryDate: { lte: new Date(now.getTime() + expiryDays * DAY) }, status: { notIn: ["depleted", "quarantined"] } }, include: { product: { select: { name: true, sku: true } } }, orderBy: { expiryDate: "asc" }, take: 2000 }),
    db.salesDocument.findMany({ where: { businessId, documentType: "INVOICE", balance: { gt: 0 }, dueDate: { lte: new Date(now.getTime() + customerDays * DAY) }, status: { notIn: INVALID_SALES } }, select: { id: true, documentNo: true, customerName: true, dueDate: true, balance: true }, take: 2000 }),
    db.purchase.findMany({ where: { businessId, balance: { gt: 0 }, dueDate: { lte: new Date(now.getTime() + supplierDays * DAY) }, status: { not: "CANCELLED" } }, select: { id: true, purchaseNo: true, supplierName: true, dueDate: true, balance: true }, take: 2000 }),
    db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_cheque", dueAt: { lte: new Date(now.getTime() + chequeDays * DAY) }, status: { notIn: ["cleared", "cancelled", "replaced"] } }, take: 1000 }),
    db.purchase.findMany({ where: { businessId, status: "DRAFT" }, select: { id: true, purchaseNo: true, supplierName: true }, take: 1000 }),
    db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_transfer", status: { in: ["draft", "approved", "in_transit", "partially_received"] } }, take: 1000 }),
    db.stockCount.findMany({ where: { businessId, status: { in: ["draft", "pending", "submitted"] } }, select: { id: true, countNo: true, status: true }, take: 1000 }),
    db.salesDocument.findMany({ where: { businessId, documentType: "INVOICE", discount: { gte: largeDiscount }, createdAt: { gte: new Date(now.getTime() - DAY) }, status: { notIn: INVALID_SALES } }, select: { id: true, documentNo: true, discount: true }, take: 1000 }),
    db.customerRefund.findMany({ where: { businessId, amount: { gte: largeRefund }, refundDate: { gte: new Date(now.getTime() - DAY) } }, select: { id: true, refundNo: true, amount: true }, take: 1000 }),
  ]);
  let created = 0;
  await db.$transaction(async (tx: any) => {
    for (const p of products) { const stock = num(p.currentStock), min = num(p.minStock); if (stock <= 0) { await upsertOperationalNotification(tx,businessId,"out_of_stock","Out of Stock",`${p.name} (${p.sku}) is out of stock.`,`Product`,p.id); created++; } else if (stock <= min) { await upsertOperationalNotification(tx,businessId,"low_stock","Low Stock",`${p.name} (${p.sku}) has ${qty(stock)} remaining.`,`Product`,p.id); created++; } }
    for (const b of batches) { const expired = b.expiryDate && b.expiryDate < now; await upsertOperationalNotification(tx,businessId,expired?"expired_stock":"near_expiry",expired?"Expired Stock":"Near Expiry",`${b.product?.name || b.productId} batch ${b.batchNo} ${expired?"expired":"expires"} ${b.expiryDate?.toISOString().slice(0,10)}.`,`InventoryBatch`,b.id); created++; }
    for (const d of customerDue) { const overdue = d.dueDate && d.dueDate < now; await upsertOperationalNotification(tx,businessId,overdue?"customer_overdue":"customer_payment_due",overdue?"Customer Overdue":"Customer Payment Due",`${d.customerName} · ${d.documentNo} · balance ${money(d.balance)}.`,`SalesDocument`,d.id); created++; }
    for (const d of supplierDue) { const overdue = d.dueDate && d.dueDate < now; await upsertOperationalNotification(tx,businessId,overdue?"supplier_overdue":"supplier_payment_due",overdue?"Supplier Overdue":"Supplier Payment Due",`${d.supplierName} · ${d.purchaseNo} · balance ${money(d.balance)}.`,`Purchase`,d.id); created++; }
    for (const c of cheques) { const data=json(c.data), direction=text(data.direction||data.type).toLowerCase(); await upsertOperationalNotification(tx,businessId,direction.includes("out")?"outward_cheque_due":"inward_cheque_due",direction.includes("out")?"Outward Cheque Due":"Inward Cheque Due",`${c.referenceNo || c.displayName} due ${c.dueAt?.toISOString().slice(0,10)}.`,`Cheque`,c.id); created++; }
    for (const p of pendingPo) { await upsertOperationalNotification(tx,businessId,"pending_po","Pending Purchase Order",`${p.purchaseNo} · ${p.supplierName}.`,`Purchase`,p.id); created++; }
    for (const t of transfers) { await upsertOperationalNotification(tx,businessId,"transfer_pending","Transfer Pending",`${t.referenceNo || t.displayName} · ${t.status}.`,`StockTransfer`,t.id); created++; }
    for (const c of counts) { await upsertOperationalNotification(tx,businessId,"stock_count_pending","Stock Count Pending",`${c.countNo} · ${c.status}.`,`StockCount`,c.id); created++; }
    for (const d of discounts) { await upsertOperationalNotification(tx,businessId,"large_discount","Large Discount",`${d.documentNo} discount ${money(d.discount)}.`,`SalesDocument`,d.id); created++; }
    for (const r of refunds) { await upsertOperationalNotification(tx,businessId,"large_refund","Large Refund",`${r.refundNo} refund ${money(r.amount)}.`,`CustomerRefund`,r.id); created++; }
    await writeAudit(tx, req, { businessId, userId, action: "grocery.notifications.generate", entityType: "Notification", after: { evaluated: { products: products.length, batches: batches.length, customerDue: customerDue.length, supplierDue: supplierDue.length, cheques: cheques.length }, attempted: created } });
  });
  return { evaluatedAt: now.toISOString(), attempted: created };
}

function stableRowsHash(entityType: string, rows: any[]) { return crypto.createHash("sha256").update(JSON.stringify({ entityType, rows })).digest("hex"); }
const IMPORT_TYPES = ["products", "categories", "customers", "suppliers", "opening_stock", "product_pricing"];
async function validateImportRows(businessId: string, entityType: string, rows: any[], context: any = {}) {
  if (!IMPORT_TYPES.includes(entityType)) throw new Error("Unsupported import entity type"); if (!Array.isArray(rows) || !rows.length) throw new Error("Import rows are required"); if (rows.length > 5000) throw new Error("One import job is limited to 5,000 rows");
  const errors: any[] = [], accepted: any[] = [], seen = new Set<string>();
  const skuList = rows.map(r => text(r.sku)).filter(Boolean); const products = skuList.length ? await db.product.findMany({ where: { businessId, sku: { in: [...new Set(skuList)] } } }) : []; const bySku = new Map(products.map((p:any) => [text(p.sku).toLowerCase(),p]));
  const warehouseId = text(context.warehouseId); const warehouse = warehouseId ? await db.warehouse.findFirst({ where: { id: warehouseId, businessId, active: true } }) : null;
  for (let index=0; index<rows.length; index++) { const r=json(rows[index]); const rowNo=index+1; const fail=(reason:string)=>errors.push({row:rowNo,reason});
    if (entityType==="products") { const sku=text(r.sku), name=text(r.name); if(!sku||!name){fail("SKU and name are required");continue;} const k=sku.toLowerCase(); if(seen.has(k)){fail("Duplicate SKU in import");continue;} seen.add(k); if(num(r.price)<0||num(r.costPrice)<0){fail("Price and cost cannot be negative");continue;} accepted.push({row:rowNo,data:{...r,sku,name}}); }
    else if(entityType==="categories"){const name=text(r.name);if(!name){fail("Category name is required");continue;}const k=name.toLowerCase();if(seen.has(k)){fail("Duplicate category in import");continue;}seen.add(k);accepted.push({row:rowNo,data:{name,active:r.active===undefined?true:bool(r.active)}});}
    else if(entityType==="customers"){const name=text(r.name);if(!name){fail("Customer name is required");continue;}if(num(r.creditLimit)<0||num(r.creditDays)<0){fail("Credit values cannot be negative");continue;}accepted.push({row:rowNo,data:{...r,name}});}
    else if(entityType==="suppliers"){const name=text(r.name);if(!name){fail("Supplier name is required");continue;}if(num(r.creditDays)<0){fail("Credit days cannot be negative");continue;}accepted.push({row:rowNo,data:{...r,name}});}
    else if(entityType==="opening_stock"){const sku=text(r.sku), amount=qty(r.quantity??r.qty);const p=bySku.get(sku.toLowerCase());if(!warehouse){fail("A valid warehouse is required for opening stock");continue;}if(!sku||!p){fail("Existing product SKU is required");continue;}if(amount<0){fail("Opening quantity cannot be negative");continue;}const movementCount=await db.stockMovement.count({where:{businessId,productId:p.id}});if(movementCount>0||Math.abs(num(p.currentStock))>.0001){fail("Opening stock can only be imported before stock movements exist");continue;}accepted.push({row:rowNo,data:{...r,productId:p.id,warehouseId:warehouse.id,quantity:amount}});}
    else if(entityType==="product_pricing"){const sku=text(r.sku),p=bySku.get(sku.toLowerCase());if(!sku||!p){fail("Existing product SKU is required");continue;}if(["retailPrice","wholesalePrice","memberPrice","promotionalPrice","minimumSellingPrice"].some(k=>r[k]!==undefined&&num(r[k])<0)){fail("Prices cannot be negative");continue;}accepted.push({row:rowNo,data:{...r,productId:p.id}});}
  }
  return { accepted, errors };
}

export async function previewImport(req: Request, businessId: string, userId: string | null, input: any) {
  await assertGrocery(businessId); const entityType=text(input.entityType).toLowerCase(), rows=Array.isArray(input.rows)?input.rows:[]; const validation=await validateImportRows(businessId,entityType,rows,input); const hash=stableRowsHash(entityType,rows); const job=await db.dataImportJob.create({data:{businessId,entityType,status:"preview",fileName:text(input.fileName)||null,totalRows:rows.length,validRows:validation.accepted.length,errorRows:validation.errors.length,errors:{rowErrors:validation.errors,previewHash:hash,context:{warehouseId:text(input.warehouseId)||null}},createdByUserId:userId}}); await writeAudit(db,req,{businessId,userId,action:"grocery.import.preview",entityType:"DataImportJob",entityId:job.id,after:{entityType,totalRows:rows.length,validRows:validation.accepted.length,errorRows:validation.errors.length}}); return {jobId:job.id,entityType,totalRows:rows.length,acceptedRows:validation.accepted.map(x=>x.row),rejectedRows:validation.errors,canCommit:validation.errors.length===0,previewHash:hash};
}

export async function commitImport(req: Request, businessId: string, userId: string | null, input: any) {
  await assertGrocery(businessId); const job=await db.dataImportJob.findFirst({where:{id:text(input.jobId),businessId,status:"preview"}});if(!job)throw new Error("Preview import job not found or already committed");const entityType=text(job.entityType),rows=Array.isArray(input.rows)?input.rows:[];const meta=json(job.errors),hash=stableRowsHash(entityType,rows);if(hash!==text(meta.previewHash))throw new Error("Import rows changed after preview; preview the exact dataset again");const validation=await validateImportRows(businessId,entityType,rows,{warehouseId:meta.context?.warehouseId});if(validation.errors.length)throw new Error("Import contains rejected rows and cannot be committed");
  const result=await db.$transaction(async(tx:any)=>{let committed=0;for(const wrapped of validation.accepted){const r=json(wrapped.data);
    if(entityType==="categories"){await tx.productCategory.upsert({where:{businessId_name:{businessId,name:r.name}},create:{businessId,name:r.name,active:r.active!==false},update:{active:r.active!==false}});committed++;}
    else if(entityType==="products"){const existing=await tx.product.findUnique({where:{businessId_sku:{businessId,sku:r.sku}}});const data:any={name:r.name,barcode:text(r.barcode)||null,qrCode:text(r.qrCode)||null,code:text(r.code)||null,itemCode:text(r.itemCode)||null,productCode:text(r.productCode)||null,category:text(r.category)||null,brand:text(r.brand)||null,unit:text(r.unit)||"PCS",price:Math.max(0,num(r.price)),costPrice:Math.max(0,num(r.costPrice)),minStock:Math.max(0,num(r.minStock)),active:r.active===undefined?true:bool(r.active),deleted:false};if(existing)await tx.product.update({where:{id:existing.id},data});else await tx.product.create({data:{businessId,sku:r.sku,openingStock:0,currentStock:0,...data}});committed++;}
    else if(entityType==="customers"){let existing=null;if(text(r.code))existing=await tx.customer.findFirst({where:{businessId,code:text(r.code)}});const data:any={name:r.name,code:text(r.code)||null,company:text(r.company)||null,phone:text(r.phone)||null,email:text(r.email).toLowerCase()||null,type:text(r.type)||"Retail",address:text(r.address)||null,creditLimit:Math.max(0,num(r.creditLimit)),creditDays:Math.max(0,Math.trunc(num(r.creditDays,30))),active:r.active===undefined?true:bool(r.active),status:r.active===false?"inactive":"active"};if(existing)await tx.customer.update({where:{id:existing.id},data});else await tx.customer.create({data:{businessId,openingBalance:num(r.openingBalance),balance:num(r.openingBalance),...data}});committed++;}
    else if(entityType==="suppliers"){const existing=await tx.supplier.findFirst({where:{businessId,name:r.name,company:text(r.company)||null}});const data:any={name:r.name,company:text(r.company)||null,phone:text(r.phone)||null,email:text(r.email)||null,address:text(r.address)||null,creditDays:Math.max(0,Math.trunc(num(r.creditDays,30))),active:r.active===undefined?true:bool(r.active)};if(existing)await tx.supplier.update({where:{id:existing.id},data});else await tx.supplier.create({data:{businessId,openingBalance:num(r.openingBalance),balance:num(r.openingBalance),...data}});committed++;}
    else if(entityType==="opening_stock"){const p=await tx.product.findFirst({where:{id:r.productId,businessId}});if(!p)throw new Error("Product disappeared during opening-stock import");const amount=qty(r.quantity),cost=Math.max(0,num(r.costPrice,p.costPrice)),stock=await tx.inventoryStock.findUnique({where:{businessId_productId_warehouseId:{businessId,productId:p.id,warehouseId:r.warehouseId}}});if(stock&&Math.abs(num(stock.qtyOnHand))>.0001)throw new Error(`${p.sku}: warehouse already contains stock`);await tx.inventoryStock.upsert({where:{businessId_productId_warehouseId:{businessId,productId:p.id,warehouseId:r.warehouseId}},create:{businessId,productId:p.id,warehouseId:r.warehouseId,qtyOnHand:amount},update:{qtyOnHand:amount}});await tx.product.update({where:{id:p.id},data:{openingStock:amount,currentStock:amount,costPrice:cost}});if(amount>0){const batch=await tx.inventoryBatch.create({data:{businessId,productId:p.id,warehouseId:r.warehouseId,batchNo:text(r.batchNo)||`OPEN-${p.sku}`,qtyOnHandBase:amount,qtyReservedBase:0,costPerBaseUnit:cost,status:"available",createdByUserId:userId,updatedByUserId:userId}});await tx.stockMovement.create({data:{businessId,movementNo:await nextEntityNumber(tx,"stockMovement","movementNo",businessId,"MOV"),productId:p.id,sku:p.sku,productName:p.name,warehouseId:r.warehouseId,direction:"IN",movementType:"OPENING_STOCK",referenceNo:job.id,qty:amount,beforeQty:0,afterQty:amount,source:"grocery_bulk_import",metadata:{importJobId:job.id,inventoryBatchId:batch.id,costPerBaseUnit:cost}}});}committed++;}
    else if(entityType==="product_pricing"){const p=await tx.product.findFirst({where:{id:r.productId,businessId}});if(!p)throw new Error("Product disappeared during pricing import");const cf=json(p.customFields),g={...readGroceryProductProfile(p),...(r.retailPrice!==undefined?{retailPrice:Math.max(0,num(r.retailPrice))}:{}),...(r.wholesalePrice!==undefined?{wholesalePrice:Math.max(0,num(r.wholesalePrice))}:{}),...(r.memberPrice!==undefined?{memberPrice:Math.max(0,num(r.memberPrice))}:{}),...(r.promotionalPrice!==undefined?{promotionalPrice:Math.max(0,num(r.promotionalPrice))}:{}),...(r.minimumSellingPrice!==undefined?{minimumSellingPrice:Math.max(0,num(r.minimumSellingPrice))}:{})};await tx.product.update({where:{id:p.id},data:{price:g.retailPrice,customFields:{...cf,grocery:g}}});committed++;}
  }await tx.dataImportJob.update({where:{id:job.id},data:{status:"completed",completedAt:new Date(),validRows:committed,errorRows:0}});await writeAudit(tx,req,{businessId,userId,action:"grocery.import.commit",entityType:"DataImportJob",entityId:job.id,after:{entityType,committed}});return{jobId:job.id,entityType,committed};});return result;
}

export async function exportDataset(businessId: string, entityType: string, query: any = {}) {
  await assertGrocery(businessId); entityType=text(entityType).toLowerCase(); if(!IMPORT_TYPES.includes(entityType))throw new Error("Unsupported export entity type");const page=pageOf(query.page),limit=limitOf(query.limit??query.pageSize,500,5000),skip=(page-1)*limit;let rows:any[]=[];let total=0;
  if(entityType==="products"){[rows,total]=await Promise.all([db.product.findMany({where:{businessId,deleted:false},orderBy:{sku:"asc"},skip,take:limit}),db.product.count({where:{businessId,deleted:false}})]);rows=rows.map((p:any)=>({sku:p.sku,name:p.name,barcode:p.barcode,category:p.category,brand:p.brand,unit:p.unit,price:Number(p.price),costPrice:Number(p.costPrice),minStock:Number(p.minStock),currentStock:Number(p.currentStock)}));}
  else if(entityType==="categories"){[rows,total]=await Promise.all([db.productCategory.findMany({where:{businessId},orderBy:{name:"asc"},skip,take:limit}),db.productCategory.count({where:{businessId}})]);}
  else if(entityType==="customers"){[rows,total]=await Promise.all([db.customer.findMany({where:{businessId},orderBy:{name:"asc"},skip,take:limit}),db.customer.count({where:{businessId}})]);}
  else if(entityType==="suppliers"){[rows,total]=await Promise.all([db.supplier.findMany({where:{businessId},orderBy:{name:"asc"},skip,take:limit}),db.supplier.count({where:{businessId}})]);}
  else if(entityType==="opening_stock"){[rows,total]=await Promise.all([db.inventoryStock.findMany({where:{businessId},skip,take:limit}),db.inventoryStock.count({where:{businessId}})]);}
  else if(entityType==="product_pricing"){const products=await db.product.findMany({where:{businessId,deleted:false},orderBy:{sku:"asc"},skip,take:limit});total=await db.product.count({where:{businessId,deleted:false}});rows=products.map((p:any)=>{const g=readGroceryProductProfile(p);return{sku:p.sku,retailPrice:g.retailPrice,wholesalePrice:g.wholesalePrice,memberPrice:g.memberPrice,promotionalPrice:g.promotionalPrice,minimumSellingPrice:g.minimumSellingPrice};});}
  return{entityType,rows,meta:{page,pageSize:limit,totalRows:total,totalPages:Math.max(1,Math.ceil(total/limit))}};
}

export async function globalSearch(businessId: string, query: any = {}) {
  await assertGrocery(businessId); const q=text(query.q);if(q.length<2)throw new Error("Search requires at least 2 characters");const take=limitOf(query.limit,10,25);const contains={contains:q,mode:"insensitive"};
  const [products,customers,suppliers,sales,purchases,grns,cheques,customerPayments,supplierPayments]=await Promise.all([
    db.product.findMany({where:{businessId,deleted:false,OR:[{name:contains},{sku:contains},{barcode:contains},{code:contains},{itemCode:contains},{productCode:contains}]},select:{id:true,name:true,sku:true,barcode:true,category:true},take,orderBy:{name:"asc"}}),
    db.customer.findMany({where:{businessId,OR:[{name:contains},{code:contains},{company:contains},{phone:contains},{email:contains}]},select:{id:true,name:true,code:true,phone:true,balance:true},take,orderBy:{name:"asc"}}),
    db.supplier.findMany({where:{businessId,OR:[{name:contains},{company:contains},{phone:contains},{email:contains}]},select:{id:true,name:true,phone:true,balance:true},take,orderBy:{name:"asc"}}),
    db.salesDocument.findMany({where:{businessId,OR:[{documentNo:contains},{customerName:contains},{referenceNo:contains}]},select:{id:true,documentNo:true,customerName:true,total:true,status:true,createdAt:true},take,orderBy:{createdAt:"desc"}}),
    db.purchase.findMany({where:{businessId,OR:[{purchaseNo:contains},{supplierName:contains},{referenceNo:contains}]},select:{id:true,purchaseNo:true,supplierName:true,total:true,status:true,purchaseDate:true},take,orderBy:{purchaseDate:"desc"}}),
    db.goodsReceipt.findMany({where:{businessId,OR:[{receiptNo:contains},{notes:contains}]},select:{id:true,receiptNo:true,purchaseId:true,receivedAt:true},take,orderBy:{receivedAt:"desc"}}),
    db.industryRecord.findMany({where:{businessId,industryCode:"grocery",entityType:"grocery_cheque",OR:[{referenceNo:contains},{displayName:contains}]},select:{id:true,referenceNo:true,displayName:true,status:true,dueAt:true,amount:true},take,orderBy:{dueAt:"desc"}}),
    db.customerPayment.findMany({where:{businessId,OR:[{receiptNo:contains},{customerName:contains},{referenceNo:contains}]},select:{id:true,receiptNo:true,customerName:true,amount:true,paymentDate:true},take,orderBy:{paymentDate:"desc"}}),
    db.supplierPayment.findMany({where:{businessId,OR:[{paymentNo:contains},{supplierName:contains},{referenceNo:contains}]},select:{id:true,paymentNo:true,supplierName:true,amount:true,paymentDate:true},take,orderBy:{paymentDate:"desc"}}),
  ]);
  return{query:q,groups:{products,customers,suppliers,sales,purchases,grns,cheques,vouchers:[...customerPayments.map((x:any)=>({...x,voucherType:"receipt"})),...supplierPayments.map((x:any)=>({...x,voucherType:"payment"}))].slice(0,take)},meta:{limitPerGroup:take,serverSide:true}};
}
