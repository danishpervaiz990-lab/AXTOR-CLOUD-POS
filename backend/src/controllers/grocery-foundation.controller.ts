import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { loadUserAccess, hasPermission } from "../services/access.service.js";
import { writeAudit } from "../services/audit.service.js";
import { nextEntityNumber } from "../services/numbering.service.js";

const db: any = prisma;
const DAY = 86_400_000;
const AGEING_DEFAULT = [7, 15, 30, 60, 90];
const PURCHASE_WORKFLOW = new Set(["DRAFT", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CLOSED", "CANCELLED"]);

function tenant(req: Request) {
  const businessId = req.tenant?.businessId;
  const userId = req.tenant?.userId;
  if (!businessId || !userId) throw new Error("Authenticated tenant and user are required");
  return { businessId, userId };
}
function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function round3(value: number) { return Math.round((value + Number.EPSILON) * 1000) / 1000; }
function asDate(value: unknown): Date | null { if (!value) return null; const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? null : d; }
function json(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok: true, data }); }
function fail(res: Response, message: string, status = 400, code = "INVALID_REQUEST") { return res.status(status).json({ ok: false, error: { code, message } }); }
function dayStart(date = new Date()) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function addDays(date: Date, days: number) { return new Date(date.getTime() + days * DAY); }
function dueStatus(dueDate: Date | null, balance: number) {
  if (balance <= 0) return { status: "Paid", overdueDays: 0 };
  if (!dueDate) return { status: "Not Due", overdueDays: 0 };
  const today = dayStart(); const due = dayStart(dueDate); const diff = Math.floor((today.getTime() - due.getTime()) / DAY);
  if (diff < 0) return { status: "Not Due", overdueDays: 0 };
  if (diff === 0) return { status: "Due Today", overdueDays: 0 };
  return { status: "Overdue", overdueDays: diff };
}
function customerProfile(customer: any) {
  const metadata = json(customer?.metadata); const p = json(metadata.groceryProfile);
  return {
    alternateMobile: p.alternateMobile || null,
    billingAddress: p.billingAddress || customer?.address || null,
    deliveryAddress: p.deliveryAddress || null,
    taxVatNumber: p.taxVatNumber || null,
    priceLevel: p.priceLevel || "retail",
    loyaltyMembership: p.loyaltyMembership || null,
    loyaltyPoints: num(p.loyaltyPoints),
    notes: p.notes || null,
    blockCreditSalesIfOverdue: Boolean(p.blockCreditSalesIfOverdue),
    creditWarningDays: Math.max(0, Math.trunc(num(p.creditWarningDays, 0))),
  };
}
async function supplierProfileRecord(businessId: string, supplierId: string) {
  return db.industryRecord.findFirst({ where: { businessId, industryCode: "grocery", entityType: "grocery_supplier_profile", relatedEntityId: supplierId, archivedAt: null } });
}
function supplierProfile(record: any) {
  const p = json(record?.data);
  return {
    supplierCode: p.supplierCode || null,
    contactPerson: p.contactPerson || null,
    taxVatRegistration: p.taxVatRegistration || null,
    paymentTerms: p.paymentTerms || null,
    bankDetails: p.bankDetails || null,
    notes: p.notes || null,
    defaultCurrency: p.defaultCurrency || null,
  };
}
async function readAgeingCuts(businessId: string) {
  const setting = await db.appSetting.findFirst({ where: { businessId, key: "grocery.ageing.buckets" } });
  const raw = Array.isArray(setting?.value) ? setting.value : json(setting?.value).value;
  const values = Array.isArray(raw) ? raw.map((x: unknown) => Math.max(1, Math.trunc(num(x)))).filter(Boolean).slice(0, 5) : [];
  if (values.length !== 5 || values.some((v: number, i: number) => i > 0 && v <= values[i - 1])) return AGEING_DEFAULT;
  return values;
}
function ageingBucket(overdueDays: number, cuts: number[]) {
  if (overdueDays <= 0) return "Current";
  if (overdueDays <= cuts[0]) return `1–${cuts[0]} days`;
  if (overdueDays <= cuts[1]) return `${cuts[0] + 1}–${cuts[1]} days`;
  if (overdueDays <= cuts[2]) return `${cuts[1] + 1}–${cuts[2]} days`;
  if (overdueDays <= cuts[3]) return `${cuts[2] + 1}–${cuts[3]} days`;
  if (overdueDays <= cuts[4]) return `${cuts[3] + 1}–${cuts[4]} days`;
  return `${cuts[4]}+ days`;
}
function percentage(value: number, total: number) { return total === 0 ? 0 : round2(value / total * 100); }

export async function groceryContext(req: Request, res: Response) {
  try {
    const t = tenant(req); const access = await loadUserAccess(db, t.businessId, t.userId);
    const [branches, salesmen, categories, settings] = await Promise.all([
      db.branch.findMany({ where: { businessId: t.businessId, active: true }, include: { warehouses: { where: { active: true } }, counters: { where: { status: "ACTIVE" } } }, orderBy: { name: "asc" } }),
      db.salesman.findMany({ where: { businessId: t.businessId, active: true }, orderBy: { name: "asc" }, take: 200 }),
      db.productCategory.findMany({ where: { businessId: t.businessId, active: true }, orderBy: { name: "asc" }, take: 300 }),
      db.appSetting.findMany({ where: { businessId: t.businessId, key: { in: ["sales.blockOverdueCredit", "sales.allowNegativeStock", "inventory.expiryWarningDays", "inventory.fefoEnabled"] } } }),
    ]);
    return ok(res, { access: { roleNames: access.roleNames, permissions: [...access.permissions], isOwner: access.isOwner, isAdmin: access.isAdmin, isManager: access.isManager, branchId: access.branchId }, branches, salesmen, categories, settings: Object.fromEntries(settings.map((x: any) => [x.key, x.value])) });
  } catch (e: any) { return fail(res, e?.message || "Failed to load Grocery context", 500, "CONTEXT_FAILED"); }
}

export async function saveGroceryCustomerProfile(req: Request, res: Response) {
  try {
    const t = tenant(req); const customer = await db.customer.findFirst({ where: { id: req.params.id, businessId: t.businessId } });
    if (!customer) return fail(res, "Customer not found", 404, "CUSTOMER_NOT_FOUND");
    const before = customerProfile(customer); const input = req.body || {};
    const profile = {
      ...before,
      ...(input.alternateMobile !== undefined ? { alternateMobile: text(input.alternateMobile) || null } : {}),
      ...(input.billingAddress !== undefined ? { billingAddress: text(input.billingAddress) || null } : {}),
      ...(input.deliveryAddress !== undefined ? { deliveryAddress: text(input.deliveryAddress) || null } : {}),
      ...(input.taxVatNumber !== undefined ? { taxVatNumber: text(input.taxVatNumber) || null } : {}),
      ...(input.priceLevel !== undefined ? { priceLevel: text(input.priceLevel) || "retail" } : {}),
      ...(input.loyaltyMembership !== undefined ? { loyaltyMembership: text(input.loyaltyMembership) || null } : {}),
      ...(input.loyaltyPoints !== undefined ? { loyaltyPoints: Math.max(0, num(input.loyaltyPoints)) } : {}),
      ...(input.notes !== undefined ? { notes: text(input.notes) || null } : {}),
      ...(input.blockCreditSalesIfOverdue !== undefined ? { blockCreditSalesIfOverdue: Boolean(input.blockCreditSalesIfOverdue) } : {}),
      ...(input.creditWarningDays !== undefined ? { creditWarningDays: Math.max(0, Math.trunc(num(input.creditWarningDays))) } : {}),
    };
    const metadata = { ...json(customer.metadata), groceryProfile: profile };
    const updated = await db.customer.update({ where: { id: customer.id }, data: { metadata, ...(input.preferredCurrency !== undefined ? { preferredCurrency: text(input.preferredCurrency).toUpperCase() || null } : {}) } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.customer.profile.update", entityType: "Customer", entityId: customer.id, before, after: profile });
    return ok(res, { ...updated, creditLimit: num(updated.creditLimit), openingBalance: num(updated.openingBalance), balance: num(updated.balance), ...profile });
  } catch (e: any) { return fail(res, e?.message || "Failed to update Grocery customer profile", 500, "CUSTOMER_PROFILE_FAILED"); }
}

async function buildCustomerOverview(businessId: string, customer: any) {
  const [invoices, payments, returns, cuts] = await Promise.all([
    db.salesDocument.findMany({ where: { businessId, customerId: customer.id, documentType: "INVOICE", status: { notIn: ["CANCELLED", "VOID"] } }, include: { items: true }, orderBy: { issuedAt: "desc" }, take: 1000 }),
    db.customerPayment.findMany({ where: { businessId, customerId: customer.id }, orderBy: { paymentDate: "desc" }, take: 1000 }),
    db.salesReturn.findMany({ where: { businessId, customerId: customer.id }, include: { items: true }, orderBy: { returnDate: "desc" }, take: 1000 }),
    readAgeingCuts(businessId),
  ]);
  const totalPurchases = round2(invoices.reduce((s: number, x: any) => s + num(x.total), 0));
  const totalReturns = round2(returns.reduce((s: number, x: any) => s + num(x.total), 0));
  const totalPayments = round2(payments.reduce((s: number, x: any) => s + num(x.amount), 0));
  const outstanding = round2(invoices.reduce((s: number, x: any) => s + Math.max(0, num(x.balance)), 0));
  const now = dayStart(); const overdueInvoices = invoices.filter((x: any) => num(x.balance) > 0 && x.dueDate && dayStart(new Date(x.dueDate)) < now);
  const overdueAmount = round2(overdueInvoices.reduce((s: number, x: any) => s + num(x.balance), 0));
  const creditLimit = num(customer.creditLimit); const availableCredit = creditLimit > 0 ? Math.max(0, round2(creditLimit - outstanding)) : null;
  const productMap = new Map<string, { productId: string | null; name: string; quantity: number; sales: number }>();
  for (const invoice of invoices) for (const item of invoice.items || []) { const key = String(item.productId || item.sku || item.name); const row = productMap.get(key) || { productId: item.productId || null, name: item.name, quantity: 0, sales: 0 }; row.quantity += num(item.qty); row.sales += num(item.total); productMap.set(key, row); }
  const ageing = invoices.filter((x: any) => num(x.balance) > 0).map((x: any) => { const due = x.dueDate ? new Date(x.dueDate) : null; const ds = dueStatus(due, num(x.balance)); return { invoiceId: x.id, invoiceNo: x.documentNo, invoiceDate: x.issuedAt || x.createdAt, dueDate: due, amount: num(x.total), paid: num(x.paid), balance: num(x.balance), overdueDays: ds.overdueDays, dueStatus: ds.status, bucket: ageingBucket(ds.overdueDays, cuts) }; });
  const ledger = [
    ...invoices.map((x: any) => ({ date: x.issuedAt || x.createdAt, type: "Invoice", reference: x.documentNo, debit: num(x.total), credit: 0 })),
    ...payments.map((x: any) => ({ date: x.paymentDate, type: "Payment", reference: x.receiptNo, debit: 0, credit: num(x.amount) })),
    ...returns.map((x: any) => ({ date: x.returnDate, type: "Sales Return", reference: x.returnNo, debit: 0, credit: num(x.total) })),
  ].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let running = num(customer.openingBalance); const ledgerWithBalance = ledger.map((x: any) => ({ ...x, balance: round2(running = running + x.debit - x.credit) }));
  return { customer: { ...customer, creditLimit, creditDays: num(customer.creditDays), openingBalance: num(customer.openingBalance), balance: num(customer.balance), ...customerProfile(customer) }, summary: { totalPurchases, totalReturns, totalPayments, totalOutstanding: outstanding, overdueAmount, availableCredit, averageInvoiceValue: invoices.length ? round2(totalPurchases / invoices.length) : 0, grossProfitGenerated: null, grossProfitAvailable: false, lastPurchase: invoices[0]?.issuedAt || invoices[0]?.createdAt || null }, mostPurchasedProducts: [...productMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 20), paymentHistory: payments, invoiceHistory: invoices.map((x: any) => ({ ...x, total: num(x.total), paid: num(x.paid), balance: num(x.balance) })), returnHistory: returns.map((x: any) => ({ ...x, total: num(x.total) })), ledger: ledgerWithBalance, ageing, ageingBuckets: cuts };
}

export async function groceryCustomerOverview(req: Request, res: Response) {
  try { const t = tenant(req); const customer = await db.customer.findFirst({ where: { id: req.params.id, businessId: t.businessId } }); if (!customer) return fail(res, "Customer not found", 404, "CUSTOMER_NOT_FOUND"); return ok(res, await buildCustomerOverview(t.businessId, customer)); }
  catch (e: any) { return fail(res, e?.message || "Failed to load customer overview", 500, "CUSTOMER_OVERVIEW_FAILED"); }
}

export async function saveGrocerySupplierProfile(req: Request, res: Response) {
  try {
    const t = tenant(req); const supplier = await db.supplier.findFirst({ where: { id: req.params.id, businessId: t.businessId } }); if (!supplier) return fail(res, "Supplier not found", 404, "SUPPLIER_NOT_FOUND");
    const existing = await supplierProfileRecord(t.businessId, supplier.id); const before = supplierProfile(existing); const input = req.body || {};
    const data = { ...before,
      ...(input.supplierCode !== undefined ? { supplierCode: text(input.supplierCode) || null } : {}),
      ...(input.contactPerson !== undefined ? { contactPerson: text(input.contactPerson) || null } : {}),
      ...(input.taxVatRegistration !== undefined ? { taxVatRegistration: text(input.taxVatRegistration) || null } : {}),
      ...(input.paymentTerms !== undefined ? { paymentTerms: text(input.paymentTerms) || null } : {}),
      ...(input.bankDetails !== undefined ? { bankDetails: input.bankDetails || null } : {}),
      ...(input.notes !== undefined ? { notes: text(input.notes) || null } : {}),
      ...(input.defaultCurrency !== undefined ? { defaultCurrency: text(input.defaultCurrency).toUpperCase() || null } : {}),
    };
    let record;
    if (existing) record = await db.industryRecord.update({ where: { id: existing.id }, data: { displayName: supplier.name, data, revision: { increment: 1 }, updatedByUserId: t.userId } });
    else record = await db.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_supplier_profile", referenceNo: supplier.id, displayName: supplier.name, relatedEntityId: supplier.id, status: "active", data, createdByUserId: t.userId, updatedByUserId: t.userId } });
    if (input.defaultCurrency !== undefined) await db.supplier.update({ where: { id: supplier.id }, data: { preferredCurrency: data.defaultCurrency } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.supplier.profile.update", entityType: "Supplier", entityId: supplier.id, before, after: data });
    return ok(res, { supplierId: supplier.id, ...supplierProfile(record) });
  } catch (e: any) { return fail(res, e?.message || "Failed to update supplier profile", 500, "SUPPLIER_PROFILE_FAILED"); }
}

export async function grocerySupplierOverview(req: Request, res: Response) {
  try {
    const t = tenant(req); const supplier = await db.supplier.findFirst({ where: { id: req.params.id, businessId: t.businessId } }); if (!supplier) return fail(res, "Supplier not found", 404, "SUPPLIER_NOT_FOUND");
    const [profileRecord, purchases, payments, returns, cheques, cuts] = await Promise.all([
      supplierProfileRecord(t.businessId, supplier.id),
      db.purchase.findMany({ where: { businessId: t.businessId, supplierId: supplier.id, status: { not: "CANCELLED" } }, include: { items: true }, orderBy: { purchaseDate: "desc" }, take: 1000 }),
      db.supplierPayment.findMany({ where: { businessId: t.businessId, supplierId: supplier.id }, orderBy: { paymentDate: "desc" }, take: 1000 }),
      db.purchaseReturn.findMany({ where: { businessId: t.businessId, supplierId: supplier.id }, include: { items: true }, orderBy: { returnDate: "desc" }, take: 1000 }),
      db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_cheque", relatedEntityId: supplier.id, archivedAt: null }, orderBy: { dueAt: "desc" }, take: 500 }),
      readAgeingCuts(t.businessId),
    ]);
    const totalPurchases = round2(purchases.reduce((s: number, x: any) => s + num(x.total), 0)); const totalReturns = round2(returns.reduce((s: number, x: any) => s + num(x.total), 0)); const totalPayments = round2(payments.reduce((s: number, x: any) => s + num(x.amount), 0)); const outstanding = round2(purchases.reduce((s: number, x: any) => s + Math.max(0, num(x.balance)), 0));
    const ageing = purchases.filter((x: any) => num(x.balance) > 0).map((x: any) => { const due = x.dueDate ? new Date(x.dueDate) : null; const ds = dueStatus(due, num(x.balance)); return { purchaseId: x.id, purchaseNo: x.purchaseNo, purchaseDate: x.purchaseDate, dueDate: due, amount: num(x.total), paid: num(x.paid), balance: num(x.balance), overdueDays: ds.overdueDays, dueStatus: ds.status, bucket: ageingBucket(ds.overdueDays, cuts) }; });
    const overdue = round2(ageing.filter((x: any) => x.overdueDays > 0).reduce((s: number, x: any) => s + x.balance, 0));
    const products = new Map<string, any>(); for (const p of purchases) for (const i of p.items || []) { const key = String(i.productId || i.sku || i.name); const row = products.get(key) || { productId: i.productId || null, name: i.name, quantity: 0, purchaseValue: 0 }; row.quantity += num(i.qty); row.purchaseValue += num(i.total); products.set(key, row); }
    const ledger = [ ...purchases.map((x: any) => ({ date: x.purchaseDate, type: "Purchase", reference: x.purchaseNo, debit: 0, credit: num(x.total) })), ...payments.map((x: any) => ({ date: x.paymentDate, type: "Supplier Payment", reference: x.voucherNo, debit: num(x.amount), credit: 0 })), ...returns.map((x: any) => ({ date: x.returnDate, type: "Purchase Return", reference: x.returnNo, debit: num(x.total), credit: 0 })) ].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let running = num(supplier.openingBalance); const ledgerWithBalance = ledger.map((x: any) => ({ ...x, balance: round2(running = running + x.credit - x.debit) }));
    return ok(res, { supplier: { ...supplier, creditDays: num(supplier.creditDays), openingBalance: num(supplier.openingBalance), balance: num(supplier.balance), ...supplierProfile(profileRecord) }, summary: { totalPurchases, totalReturns, totalPayments, totalOutstanding: outstanding, overdueAmount: overdue, averagePurchaseValue: purchases.length ? round2(totalPurchases / purchases.length) : 0, lastPurchase: purchases[0]?.purchaseDate || null }, purchases, returns, payments, cheques, productsPurchased: [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 30), ledger: ledgerWithBalance, ageing, ageingBuckets: cuts });
  } catch (e: any) { return fail(res, e?.message || "Failed to load supplier overview", 500, "SUPPLIER_OVERVIEW_FAILED"); }
}

export async function groceryAgeing(req: Request, res: Response) {
  try {
    const t = tenant(req); const scope = text(req.query.scope).toLowerCase() === "supplier" ? "supplier" : "customer"; const cuts = await readAgeingCuts(t.businessId); let rows: any[] = [];
    if (scope === "customer") {
      const docs = await db.salesDocument.findMany({ where: { businessId: t.businessId, documentType: "INVOICE", balance: { gt: 0 }, status: { notIn: ["CANCELLED", "VOID"] } }, orderBy: { dueDate: "asc" }, take: 5000 });
      rows = docs.map((x: any) => { const ds = dueStatus(x.dueDate ? new Date(x.dueDate) : null, num(x.balance)); return { entityId: x.customerId, entityName: x.customerName, documentId: x.id, documentNo: x.documentNo, documentDate: x.issuedAt || x.createdAt, dueDate: x.dueDate, amount: num(x.total), balance: num(x.balance), overdueDays: ds.overdueDays, dueStatus: ds.status, bucket: ageingBucket(ds.overdueDays, cuts), branchId: x.branchId }; });
    } else {
      const docs = await db.purchase.findMany({ where: { businessId: t.businessId, balance: { gt: 0 }, status: { not: "CANCELLED" } }, orderBy: { dueDate: "asc" }, take: 5000 });
      rows = docs.map((x: any) => { const ds = dueStatus(x.dueDate ? new Date(x.dueDate) : null, num(x.balance)); return { entityId: x.supplierId, entityName: x.supplierName, documentId: x.id, documentNo: x.purchaseNo, documentDate: x.purchaseDate, dueDate: x.dueDate, amount: num(x.total), balance: num(x.balance), overdueDays: ds.overdueDays, dueStatus: ds.status, bucket: ageingBucket(ds.overdueDays, cuts), branchId: x.branchId }; });
    }
    if (req.query.branchId) rows = rows.filter(x => String(x.branchId || "") === String(req.query.branchId));
    const total = round2(rows.reduce((s, x) => s + x.balance, 0)); const overdue = round2(rows.filter(x => x.overdueDays > 0).reduce((s, x) => s + x.balance, 0));
    const bucketSummary = [...new Set(rows.map(x => x.bucket))].map(bucket => { const amount = round2(rows.filter(x => x.bucket === bucket).reduce((s, x) => s + x.balance, 0)); return { bucket, amount, percentage: percentage(amount, total) }; });
    return ok(res, { scope, cuts, total, overdue, overduePercentage: percentage(overdue, total), bucketSummary, rows });
  } catch (e: any) { return fail(res, e?.message || "Failed to load ageing", 500, "AGEING_FAILED"); }
}

export async function groceryExpiry(req: Request, res: Response) {
  try {
    const t = tenant(req); const window = text(req.query.window || req.query.days || "30").toLowerCase(); const warehouseId = text(req.query.warehouseId); const batches = await db.inventoryBatch.findMany({ where: { businessId: t.businessId, qtyOnHandBase: { gt: 0 }, ...(warehouseId ? { warehouseId } : {}) }, include: { product: true, warehouse: true }, orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }], take: 5000 });
    const now = dayStart(); let from: Date | null = null; let to: Date | null = null;
    if (window === "expired") to = new Date(now.getTime() - 1); else if (window === "today") { from = now; to = new Date(now.getTime() + DAY - 1); } else { const days = Math.max(1, Math.min(3650, Math.trunc(num(window, 30)))); from = now; to = new Date(now.getTime() + days * DAY + DAY - 1); }
    const totalInventoryValue = round2(batches.reduce((s: number, b: any) => s + num(b.qtyOnHandBase) * num(b.costPerBaseUnit), 0));
    const filtered = batches.filter((b: any) => { if (!b.expiryDate) return false; const d = new Date(b.expiryDate); return (!from || d >= from) && (!to || d <= to); }).map((b: any) => { const value = round2(num(b.qtyOnHandBase) * num(b.costPerBaseUnit)); const daysToExpiry = Math.floor((dayStart(new Date(b.expiryDate)).getTime() - now.getTime()) / DAY); const md = json(b.metadata); return { id: b.id, productId: b.productId, product: b.product?.name || null, sku: b.product?.sku || null, category: b.product?.category || null, supplierId: md.supplierId || null, supplier: md.supplierName || null, purchaseReference: md.purchaseNo || md.purchaseReference || null, warehouseId: b.warehouseId, warehouse: b.warehouse?.name || null, batch: b.batchNo, manufacturingDate: b.productionDate, expiryDate: b.expiryDate, quantity: num(b.qtyOnHandBase), reserved: num(b.qtyReservedBase), receivedCost: num(b.costPerBaseUnit), expiryValue: value, percentageOfInventoryValue: percentage(value, totalInventoryValue), daysToExpiry, expiryStatus: daysToExpiry < 0 ? "Expired" : daysToExpiry === 0 ? "Expiring Today" : `Expiring in ${daysToExpiry} days` }; });
    const expiryValue = round2(filtered.reduce((s: number, x: any) => s + x.expiryValue, 0)); return ok(res, { window, totalInventoryValue, expiryValue, percentageOfTotalInventoryValue: percentage(expiryValue, totalInventoryValue), count: filtered.length, rows: filtered });
  } catch (e: any) { return fail(res, e?.message || "Failed to load expiry management", 500, "EXPIRY_FAILED"); }
}

export async function groceryCreatePurchaseOrder(req: Request, res: Response) {
  try {
    const t = tenant(req); const input = req.body || {}; const supplier = await db.supplier.findFirst({ where: { id: text(input.supplierId), businessId: t.businessId, active: true } }); const warehouse = await db.warehouse.findFirst({ where: { id: text(input.warehouseId), businessId: t.businessId, active: true } });
    if (!supplier || !warehouse) return fail(res, "Valid supplier and destination warehouse are required", 422, "PURCHASE_CONTEXT_INVALID"); const rawItems = Array.isArray(input.items) ? input.items : []; if (!rawItems.length) return fail(res, "At least one purchase item is required", 422, "PURCHASE_ITEMS_REQUIRED");
    const result = await db.$transaction(async (tx: any) => {
      const items: any[] = []; const extras: any[] = [];
      for (const raw of rawItems) { const product = await tx.product.findFirst({ where: { id: text(raw.productId), businessId: t.businessId, active: true, deleted: false } }); if (!product) throw new Error("One selected product is invalid"); const qty = round3(num(raw.quantity ?? raw.qty)); const cost = round2(num(raw.unitCost ?? raw.cost)); if (qty <= 0 || cost < 0) throw new Error(`Invalid quantity or cost for ${product.name}`); const discount = round2(Math.max(0, num(raw.discount))); const taxRate = round2(Math.max(0, num(raw.taxRate ?? raw.tax))); const base = round2(qty * cost - discount); const tax = round2(base * taxRate / 100); items.push({ businessId: t.businessId, productId: product.id, sku: product.sku, barcode: product.barcode, name: product.name, qty, cost, discount, taxRate, tax, total: round2(base + tax) }); extras.push({ productId: product.id, uom: text(raw.uom || product.unit) || "PCS", packQuantity: num(raw.packQuantity, 1), batch: text(raw.batch) || null, manufacturingDate: asDate(raw.manufacturingDate)?.toISOString() || null, expiryDate: asDate(raw.expiryDate)?.toISOString() || null }); }
      const subtotal = round2(items.reduce((s, x) => s + x.qty * x.cost, 0)); const discount = round2(items.reduce((s, x) => s + x.discount, 0)); const tax = round2(items.reduce((s, x) => s + x.tax, 0)); const freight = round2(Math.max(0, num(input.freight))); const otherCharges = round2(Math.max(0, num(input.otherCharges))); const total = round2(subtotal - discount + tax + freight + otherCharges); const purchaseDate = asDate(input.purchaseDate) || new Date(); const dueDate = asDate(input.dueDate) || addDays(purchaseDate, Math.max(0, Math.trunc(num(input.creditDays, supplier.creditDays || 0)))); const purchaseNo = text(input.poNumber) || await nextEntityNumber(tx, "purchase", "purchaseNo", t.businessId, "PO");
      const row = await tx.purchase.create({ data: { businessId: t.businessId, branchId: warehouse.branchId || null, warehouseId: warehouse.id, purchaseNo, supplierId: supplier.id, supplierName: supplier.name, referenceNo: text(input.supplierReference || input.supplierInvoiceNumber) || null, dueDate, purchaseDate, subtotal, discount, tax, total, paid: 0, balance: total, status: "DRAFT", metadata: { workflowStatus: "DRAFT", expectedDeliveryDate: asDate(input.expectedDeliveryDate)?.toISOString() || null, supplierReference: text(input.supplierReference) || null, supplierInvoiceNumber: text(input.supplierInvoiceNumber) || null, paymentTerms: text(input.paymentTerms) || null, freight, otherCharges, notes: text(input.notes) || null, lineExtras: extras }, items: { create: items } }, include: { items: true } });
      await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.purchase_order.create", entityType: "Purchase", entityId: row.id, after: { purchaseNo, total, workflowStatus: "DRAFT" } }); return row;
    });
    return ok(res, result, 201);
  } catch (e: any) { return fail(res, e?.message || "Failed to create purchase order", 500, "PURCHASE_CREATE_FAILED"); }
}

export async function groceryPurchaseStatus(req: Request, res: Response) {
  try {
    const t = tenant(req); const desired = text(req.body?.status).toUpperCase(); if (!PURCHASE_WORKFLOW.has(desired)) return fail(res, "Invalid Grocery purchase workflow status", 422, "PURCHASE_STATUS_INVALID"); const purchase = await db.purchase.findFirst({ where: { id: req.params.id, businessId: t.businessId } }); if (!purchase) return fail(res, "Purchase not found", 404, "PURCHASE_NOT_FOUND");
    if (["PARTIALLY_RECEIVED", "FULLY_RECEIVED"].includes(desired)) return fail(res, "Receiving status is controlled by Goods Receiving", 409, "USE_RECEIVING"); const before = json(purchase.metadata); const metadata = { ...before, workflowStatus: desired, statusReason: text(req.body?.reason) || null, statusChangedAt: new Date().toISOString(), statusChangedBy: t.userId }; const data: any = { metadata }; if (desired === "CANCELLED") data.status = "CANCELLED"; if (desired === "CLOSED" && purchase.status !== "POSTED") return fail(res, "Only a fully received purchase can be closed", 409, "PURCHASE_NOT_RECEIVED"); const updated = await db.purchase.update({ where: { id: purchase.id }, data }); await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.purchase.status", entityType: "Purchase", entityId: purchase.id, before: { workflowStatus: before.workflowStatus || purchase.status }, after: { workflowStatus: desired, reason: metadata.statusReason } }); return ok(res, { ...updated, workflowStatus: desired });
  } catch (e: any) { return fail(res, e?.message || "Failed to change purchase status", 500, "PURCHASE_STATUS_FAILED"); }
}

export async function groceryReceivePurchase(req: Request, res: Response) {
  try {
    const t = tenant(req); const input = req.body || {}; const rawItems = Array.isArray(input.items) ? input.items : []; if (!rawItems.length) return fail(res, "At least one received item is required", 422, "RECEIPT_ITEMS_REQUIRED");
    const result = await db.$transaction(async (tx: any) => {
      const purchase = await tx.purchase.findFirst({ where: { id: req.params.id, businessId: t.businessId }, include: { items: true, goodsReceipts: { include: { items: true } } } }); if (!purchase) throw new Error("Purchase not found"); if (purchase.status === "CANCELLED") throw new Error("Cancelled purchase cannot be received"); if (purchase.status === "POSTED" && purchase.receivedAt) throw new Error("Purchase is already fully received"); const warehouse = await tx.warehouse.findFirst({ where: { id: text(input.warehouseId || purchase.warehouseId), businessId: t.businessId, active: true } }); if (!warehouse) throw new Error("Valid receiving warehouse is required");
      const orderedByProduct = new Map<string, number>(); for (const i of purchase.items) if (i.productId) orderedByProduct.set(String(i.productId), round3((orderedByProduct.get(String(i.productId)) || 0) + num(i.qty)));
      const receivedBefore = new Map<string, number>(); for (const grn of purchase.goodsReceipts) for (const i of grn.items || []) if (i.productId) receivedBefore.set(String(i.productId), round3((receivedBefore.get(String(i.productId)) || 0) + num(i.qty)));
      const normalized: any[] = []; const requestedTotals = new Map<string, number>();
      for (const raw of rawItems) { const productId = text(raw.productId); const product = await tx.product.findFirst({ where: { id: productId, businessId: t.businessId, active: true, deleted: false } }); if (!product || !orderedByProduct.has(productId)) throw new Error("One received product is not on this purchase order"); const qty = round3(num(raw.quantity ?? raw.qty)); if (qty <= 0) throw new Error(`Received quantity must be positive for ${product.name}`); const requested = round3((requestedTotals.get(productId) || 0) + qty); const available = round3((orderedByProduct.get(productId) || 0) - (receivedBefore.get(productId) || 0)); if (requested > available + .0001) throw new Error(`Received quantity exceeds remaining PO quantity for ${product.name}. Remaining: ${available}`); requestedTotals.set(productId, requested); const matching = purchase.items.find((i: any) => String(i.productId) === productId); const cost = round2(num(raw.cost ?? raw.unitCost, matching?.cost)); const batchNo = text(raw.batchNo || raw.batch) || `AUTO-${purchase.purchaseNo}-${product.sku}`; const expiryDate = asDate(raw.expiryDate); const productionDate = asDate(raw.manufacturingDate || raw.productionDate); if (expiryDate && expiryDate < dayStart()) throw new Error(`${product.name}: expiry date cannot be in the past`); normalized.push({ product, qty, cost, batchNo, expiryDate, productionDate }); }
      const receiptNo = text(input.receiptNo) || await nextEntityNumber(tx, "goodsReceipt", "receiptNo", t.businessId, "GRN"); const receipt = await tx.goodsReceipt.create({ data: { businessId: t.businessId, purchaseId: purchase.id, receiptNo, warehouseId: warehouse.id, receivedByUserId: t.userId, notes: text(input.notes) || null, items: { create: normalized.map(i => ({ businessId: t.businessId, productId: i.product.id, sku: i.product.sku, productName: i.product.name, qty: i.qty, cost: i.cost })) } }, include: { items: true } });
      for (const i of normalized) { const existing = await tx.inventoryBatch.findFirst({ where: { businessId: t.businessId, productId: i.product.id, warehouseId: warehouse.id, batchNo: i.batchNo } }); if (existing && i.expiryDate && existing.expiryDate && new Date(existing.expiryDate).getTime() !== i.expiryDate.getTime()) throw new Error(`Batch ${i.batchNo} already exists with a different expiry date`); if (existing) await tx.inventoryBatch.update({ where: { id: existing.id }, data: { qtyOnHandBase: { increment: i.qty }, costPerBaseUnit: i.cost, ...(i.expiryDate ? { expiryDate: i.expiryDate } : {}), ...(i.productionDate ? { productionDate: i.productionDate } : {}), status: "available", metadata: { ...json(existing.metadata), supplierId: purchase.supplierId, supplierName: purchase.supplierName, purchaseId: purchase.id, purchaseNo: purchase.purchaseNo, receiptNo }, revision: { increment: 1 }, updatedByUserId: t.userId } }); else await tx.inventoryBatch.create({ data: { businessId: t.businessId, productId: i.product.id, warehouseId: warehouse.id, batchNo: i.batchNo, productionDate: i.productionDate, expiryDate: i.expiryDate, smallestUnit: i.product.unit || "PCS", unitsPerStockUnit: 1, qtyOnHandBase: i.qty, qtyReservedBase: 0, costPerBaseUnit: i.cost, status: "available", metadata: { supplierId: purchase.supplierId, supplierName: purchase.supplierName, purchaseId: purchase.id, purchaseNo: purchase.purchaseNo, receiptNo }, createdByUserId: t.userId, updatedByUserId: t.userId } }); const stock = await tx.inventoryStock.findUnique({ where: { businessId_productId_warehouseId: { businessId: t.businessId, productId: i.product.id, warehouseId: warehouse.id } } }); const before = num(stock?.qtyOnHand); await tx.inventoryStock.upsert({ where: { businessId_productId_warehouseId: { businessId: t.businessId, productId: i.product.id, warehouseId: warehouse.id } }, create: { businessId: t.businessId, productId: i.product.id, warehouseId: warehouse.id, qtyOnHand: i.qty }, update: { qtyOnHand: { increment: i.qty } } }); await tx.product.update({ where: { id: i.product.id }, data: { currentStock: { increment: i.qty }, costPrice: i.cost } }); await tx.stockMovement.create({ data: { businessId: t.businessId, movementNo: await nextEntityNumber(tx, "stockMovement", "movementNo", t.businessId, "MOV"), productId: i.product.id, sku: i.product.sku, productName: i.product.name, warehouseId: warehouse.id, direction: "IN", movementType: "GROCERY_PO_RECEIPT", referenceNo: receiptNo, qty: i.qty, beforeQty: before, afterQty: round3(before + i.qty), source: "grocery_purchase_receiving", metadata: { purchaseId: purchase.id, purchaseNo: purchase.purchaseNo, receiptNo, batchNo: i.batchNo, expiryDate: i.expiryDate } } }); }
      const receivedAfter = new Map(receivedBefore); for (const [productId, qty] of requestedTotals) receivedAfter.set(productId, round3((receivedAfter.get(productId) || 0) + qty)); const full = [...orderedByProduct.entries()].every(([productId, qty]) => (receivedAfter.get(productId) || 0) + .0001 >= qty); const oldMeta = json(purchase.metadata); const workflowStatus = full ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED"; const updateData: any = { warehouseId: warehouse.id, metadata: { ...oldMeta, workflowStatus, lastReceiptNo: receiptNo, lastReceivedAt: new Date().toISOString() } }; if (full) { updateData.status = "POSTED"; updateData.receivedAt = new Date(); if (purchase.supplierId) await tx.supplier.update({ where: { id: purchase.supplierId }, data: { balance: { increment: num(purchase.balance) } } }); } const updated = await tx.purchase.update({ where: { id: purchase.id }, data: updateData }); await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.purchase.receive", entityType: "Purchase", entityId: purchase.id, after: { receiptNo, workflowStatus, fullyReceived: full, items: normalized.map(i => ({ productId: i.product.id, quantity: i.qty, batchNo: i.batchNo })) } }); return { purchase: updated, receipt, workflowStatus, fullyReceived: full, receivedByProduct: Object.fromEntries(receivedAfter) };
    }); return ok(res, result, 201);
  } catch (e: any) { return fail(res, e?.message || "Failed to receive purchase", 500, "PURCHASE_RECEIVE_FAILED"); }
}

function serializeHeld(record: any) { const data = json(record.data); return { id: record.id, referenceNo: record.referenceNo, displayName: record.displayName, status: record.status, customerId: record.relatedEntityId, amount: num(record.amount), currency: record.currency, data, createdAt: record.createdAt, updatedAt: record.updatedAt }; }
export async function groceryHeldSaleList(req: Request, res: Response) { try { const t = tenant(req); const rows = await db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_held_sale", archivedAt: null }, orderBy: { updatedAt: "desc" }, take: 200 }); return ok(res, rows.map(serializeHeld)); } catch (e: any) { return fail(res, e?.message || "Failed to load held sales", 500); } }
export async function groceryHeldSaleCreate(req: Request, res: Response) { try { const t = tenant(req); const input = req.body || {}; const lines = Array.isArray(input.items) ? input.items : []; if (!lines.length) return fail(res, "Held sale must contain at least one item", 422); const ref = text(input.referenceNo) || `HOLD-${Date.now()}`; const record = await db.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_held_sale", referenceNo: ref, displayName: text(input.name) || ref, status: "held", relatedEntityId: text(input.customerId) || null, amount: round2(num(input.total)), currency: text(input.currency || "QAR").toUpperCase(), data: { items: lines.slice(0, 500), payments: Array.isArray(input.payments) ? input.payments.slice(0, 20) : [], branchId: input.branchId || null, warehouseId: input.warehouseId || null, counterId: input.counterId || null, salespersonId: input.salespersonId || null, dueDate: input.dueDate || null, invoiceDiscount: num(input.invoiceDiscount), notes: text(input.notes) || null }, createdByUserId: t.userId, updatedByUserId: t.userId } }); await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.sale.hold", entityType: "IndustryRecord", entityId: record.id, after: { referenceNo: ref, lineCount: lines.length } }); return ok(res, serializeHeld(record), 201); } catch (e: any) { return fail(res, e?.message || "Failed to hold sale", 500); } }
export async function groceryHeldSaleDelete(req: Request, res: Response) { try { const t = tenant(req); const row = await db.industryRecord.findFirst({ where: { id: req.params.id, businessId: t.businessId, industryCode: "grocery", entityType: "grocery_held_sale", archivedAt: null } }); if (!row) return fail(res, "Held sale not found", 404); await db.industryRecord.update({ where: { id: row.id }, data: { archivedAt: new Date(), status: text(req.body?.status) || "recalled", revision: { increment: 1 }, updatedByUserId: t.userId } }); await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.sale.hold.release", entityType: "IndustryRecord", entityId: row.id, after: { status: text(req.body?.status) || "recalled" } }); return ok(res, { id: row.id, released: true }); } catch (e: any) { return fail(res, e?.message || "Failed to release held sale", 500); } }

export async function grocerySalesGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const t = tenant(req); const access = await loadUserAccess(db, t.businessId, t.userId); const input = req.body || {}; const items = Array.isArray(input.items) ? input.items : [];
    const productIds = [...new Set(items.map((i: any) => text(i.productId)).filter(Boolean))]; const products = productIds.length ? await db.product.findMany({ where: { businessId: t.businessId, id: { in: productIds }, active: true, deleted: false }, select: { id: true, price: true } }) : []; const priceMap = new Map(products.map((p: any) => [String(p.id), num(p.price)]));
    const hasPriceOverride = items.some((i: any) => { const base = priceMap.get(text(i.productId)); const supplied = num(i.unitPrice ?? i.rate ?? i.price, base); return base !== undefined && Math.abs(supplied - base) > .001; });
    if (hasPriceOverride && !hasPermission(access, "sales_documents.override_financials")) return fail(res, "Manual price override requires explicit financial override permission", 403, "PRICE_OVERRIDE_DENIED");
    const customerId = text(input.customerId); const paid = round2((Array.isArray(input.paymentLines) ? input.paymentLines : []).reduce((s: number, p: any) => s + Math.max(0, num(p.amount)), 0)); let total = 0; for (const i of items) { const qty = Math.max(0, num(i.quantity ?? i.qty)); const rate = num(i.unitPrice ?? i.rate ?? i.price, priceMap.get(text(i.productId)) || 0); const discount = Math.max(0, num(i.discountAmount ?? i.discount)); const taxable = Math.max(0, qty * rate - discount); total += taxable + taxable * Math.max(0, num(i.taxRate)) / 100; } total = round2(Math.max(0, total - Math.max(0, num(input.discount ?? input.discountTotal)))); const balance = round2(Math.max(0, total - paid));
    if (balance > 0) {
      if (!customerId) return fail(res, "A named customer is required for a credit sale", 422, "CUSTOMER_REQUIRED_FOR_CREDIT"); const customer = await db.customer.findFirst({ where: { id: customerId, businessId: t.businessId, active: true } }); if (!customer) return fail(res, "Customer not found", 404, "CUSTOMER_NOT_FOUND"); if (!input.dueDate) req.body.dueDate = addDays(new Date(), Math.max(0, Math.trunc(num(customer.creditDays, 0)))).toISOString(); const profile = customerProfile(customer); const setting = await db.appSetting.findFirst({ where: { businessId: t.businessId, key: "sales.blockOverdueCredit" } }); const globalBlock = setting ? Boolean(json(setting.value).value ?? setting.value) : false; const blockOverdue = globalBlock || profile.blockCreditSalesIfOverdue;
      if (blockOverdue) { const overdue = await db.salesDocument.findFirst({ where: { businessId: t.businessId, customerId, documentType: "INVOICE", balance: { gt: 0 }, dueDate: { lt: dayStart() }, status: { notIn: ["CANCELLED", "VOID", "PAID"] } }, orderBy: { dueDate: "asc" } }); if (overdue) { if (!hasPermission(access, "sales_documents.override_credit_limit")) return fail(res, `Customer has overdue invoice ${overdue.documentNo}; further credit is blocked`, 409, "OVERDUE_CREDIT_BLOCKED"); if (!text(input.creditOverrideReason)) return fail(res, "Credit override reason is required for overdue-credit override", 422, "CREDIT_OVERRIDE_REASON_REQUIRED"); } }
    }
    return next();
  } catch (e: any) { return fail(res, e?.message || "Grocery sale validation failed", 500, "GROCERY_SALE_GUARD_FAILED"); }
}
