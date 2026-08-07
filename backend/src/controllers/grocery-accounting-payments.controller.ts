import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";
import { postGroceryCustomerPaymentAccounting, postGrocerySupplierPaymentAccounting } from "../services/grocery-accounting.service.js";

const db: any = prisma;
function text(v: unknown) { return String(v ?? "").trim(); }
function num(v: unknown, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
function round2(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function asDate(v: unknown) { const d = new Date(String(v || "")); return Number.isNaN(d.getTime()) ? new Date() : d; }
function tenant(req: Request) { const businessId = req.tenant?.businessId; const userId = req.tenant?.userId; if (!businessId || !userId) throw new Error("Authenticated Grocery tenant is required"); return { businessId, userId }; }
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok: true, data }); }
function fail(res: Response, e: any, status = 400) { return res.status(status).json({ ok: false, error: { message: e?.message || "Request failed" } }); }

async function nextReceipt(tx: any, businessId: string) {
  await tx.$queryRawUnsafe("SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext($1))", `grocery:receipt:${businessId}`);
  const count = await tx.customerPayment.count({ where: { businessId } });
  for (let i = 1; i < 100; i += 1) { const n = `RCPT-${String(count + i).padStart(6, "0")}`; if (!await tx.customerPayment.findFirst({ where: { businessId, receiptNo: n }, select: { id: true } })) return n; }
  return `RCPT-${Date.now()}`;
}
async function nextVoucher(tx: any, businessId: string) {
  await tx.$queryRawUnsafe("SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext($1))", `grocery:supplier-voucher:${businessId}`);
  const count = await tx.supplierPayment.count({ where: { businessId } });
  for (let i = 1; i < 100; i += 1) { const n = `PV-${String(count + i).padStart(6, "0")}`; if (!await tx.supplierPayment.findFirst({ where: { businessId, voucherNo: n }, select: { id: true } })) return n; }
  return `PV-${Date.now()}`;
}

export async function createGroceryCustomerPayment(req: Request, res: Response) {
  try {
    const t = tenant(req); const amount = round2(num(req.body?.amount)); if (amount <= 0) throw new Error("Payment amount must be greater than zero"); const customerId = text(req.body?.customerId); if (!customerId) throw new Error("Customer is required"); const salesDocumentId = text(req.body?.salesDocumentId); const idempotencyKey = text(req.body?.idempotencyKey || req.headers["idempotency-key"]);
    const result = await db.$transaction(async (tx: any) => {
      if (idempotencyKey) { await tx.$queryRawUnsafe("SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext($1))", `grocery:customer-payment:${t.businessId}:${idempotencyKey}`); const duplicate = await tx.customerPayment.findFirst({ where: { businessId: t.businessId, idempotencyKey } }); if (duplicate) return { payment: duplicate, duplicate: true, accounting: await postGroceryCustomerPaymentAccounting(tx, { businessId: t.businessId, userId: t.userId, payment: duplicate }) }; }
      const customer = await tx.customer.findFirst({ where: { id: customerId, businessId: t.businessId, active: true } }); if (!customer) throw new Error("Customer not found");
      let invoice: any = null; let applied = amount;
      if (salesDocumentId) { invoice = await tx.salesDocument.findFirst({ where: { id: salesDocumentId, businessId: t.businessId, documentType: "INVOICE", customerId } }); if (!invoice) throw new Error("Customer invoice not found"); const balance = round2(num(invoice.balance)); if (balance <= 0) throw new Error("Invoice is fully paid"); if (amount > balance + 0.001) throw new Error(`Payment cannot exceed invoice balance ${balance.toFixed(2)}`); applied = amount; }
      else { const balance = round2(num(customer.balance)); if (balance > 0 && amount > balance + 0.001) throw new Error(`On-account receipt cannot exceed customer balance ${balance.toFixed(2)}`); }
      const business = await tx.business.findUnique({ where: { id: t.businessId }, select: { currency: true } }); const currency = text(req.body?.currency || invoice?.currency || business?.currency || "QAR").toUpperCase(); const exchangeRate = Math.max(0.0000001, num(req.body?.exchangeRate, invoice?.exchangeRate || 1)); const receiptNo = await nextReceipt(tx, t.businessId); const paymentDate = asDate(req.body?.paymentDate);
      const payment = await tx.customerPayment.create({ data: { businessId: t.businessId, receiptNo, customerId, customerName: customer.name, amount, currency, exchangeRate, baseAmount: round2(amount * exchangeRate), exchangeRateSource: text(req.body?.exchangeRateSource || "manual"), exchangeRateTimestamp: new Date(), method: text(req.body?.paymentMethod || req.body?.method || "cash"), accountId: text(req.body?.accountId) || null, referenceNo: text(req.body?.referenceNo) || null, idempotencyKey: idempotencyKey || null, paymentDate, allocation: { salesDocumentId: invoice?.id || null, salesDocumentNo: invoice?.documentNo || null, notes: text(req.body?.notes) || null, source: "grocery_customer_receipt" } } });
      if (invoice) { const nextPaid = round2(num(invoice.paid) + applied); const nextBalance = round2(Math.max(0, num(invoice.total) - nextPaid)); await tx.salesDocument.update({ where: { id: invoice.id }, data: { paid: nextPaid, balance: nextBalance, basePaid: round2(nextPaid * num(invoice.exchangeRate, 1)), baseBalance: round2(nextBalance * num(invoice.exchangeRate, 1)), creditAmount: nextBalance, status: nextBalance <= 0.001 ? "PAID" : "PARTIALLY_PAID", paymentStatus: nextBalance <= 0.001 ? "paid" : "partial" } }); }
      await tx.customer.update({ where: { id: customer.id }, data: { balance: round2(Math.max(0, num(customer.balance) - applied)) } });
      const accounting = await postGroceryCustomerPaymentAccounting(tx, { businessId: t.businessId, userId: t.userId, payment }); await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.customer_payment.post", entityType: "CustomerPayment", entityId: payment.id, after: { receiptNo, amount, salesDocumentId: invoice?.id || null, accounting } }); return { payment, duplicate: false, accounting };
    }); return ok(res, result, result.duplicate ? 200 : 201);
  } catch (e) { return fail(res, e); }
}

export async function createGrocerySupplierPayment(req: Request, res: Response) {
  try {
    const t = tenant(req); const amount = round2(num(req.body?.amount)); if (amount <= 0) throw new Error("Payment amount must be greater than zero"); const supplierId = text(req.body?.supplierId); if (!supplierId) throw new Error("Supplier is required"); const purchaseId = text(req.body?.purchaseId); const idempotencyKey = text(req.body?.idempotencyKey || req.headers["idempotency-key"]);
    const result = await db.$transaction(async (tx: any) => {
      if (idempotencyKey) { const existing = await tx.industryRecord.findFirst({ where: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_supplier_payment_idempotency", idempotencyKey } }); if (existing?.relatedEntityId) { const duplicate = await tx.supplierPayment.findFirst({ where: { id: existing.relatedEntityId, businessId: t.businessId } }); if (duplicate) return { payment: duplicate, duplicate: true, accounting: await postGrocerySupplierPaymentAccounting(tx, { businessId: t.businessId, userId: t.userId, payment: duplicate }) }; } }
      const supplier = await tx.supplier.findFirst({ where: { id: supplierId, businessId: t.businessId, active: true } }); if (!supplier) throw new Error("Supplier not found"); let purchase: any = null; let applied = amount;
      if (purchaseId) { purchase = await tx.purchase.findFirst({ where: { id: purchaseId, businessId: t.businessId, supplierId } }); if (!purchase) throw new Error("Supplier purchase not found"); const balance = round2(num(purchase.balance)); if (balance <= 0) throw new Error("Purchase is fully paid"); if (amount > balance + 0.001) throw new Error(`Payment cannot exceed purchase balance ${balance.toFixed(2)}`); }
      else { const balance = round2(num(supplier.balance)); if (balance > 0 && amount > balance + 0.001) throw new Error(`On-account payment cannot exceed supplier balance ${balance.toFixed(2)}`); }
      const business = await tx.business.findUnique({ where: { id: t.businessId }, select: { currency: true } }); const currency = text(req.body?.currency || purchase?.currency || business?.currency || "QAR").toUpperCase(); const exchangeRate = Math.max(0.0000001, num(req.body?.exchangeRate, purchase?.exchangeRate || 1)); const voucherNo = await nextVoucher(tx, t.businessId); const paymentDate = asDate(req.body?.paymentDate);
      const payment = await tx.supplierPayment.create({ data: { businessId: t.businessId, voucherNo, supplierId, supplierName: supplier.name, amount, currency, exchangeRate, baseAmount: round2(amount * exchangeRate), exchangeRateSource: text(req.body?.exchangeRateSource || "manual"), exchangeRateTimestamp: new Date(), method: text(req.body?.method || req.body?.paymentMethod || "cash"), accountId: text(req.body?.accountId) || null, referenceNo: text(req.body?.referenceNo) || null, paymentDate, allocation: { purchaseId: purchase?.id || null, purchaseNo: purchase?.purchaseNo || null, notes: text(req.body?.notes) || null, source: "grocery_supplier_payment" } } });
      if (idempotencyKey) await tx.industryRecord.create({ data: { businessId: t.businessId, industryCode: "grocery", entityType: "grocery_supplier_payment_idempotency", referenceNo: `SPAY-${voucherNo}`, displayName: voucherNo, relatedEntityId: payment.id, status: "posted", data: { voucherNo }, idempotencyKey, createdByUserId: t.userId } });
      if (purchase) { const nextPaid = round2(num(purchase.paid) + applied); const nextBalance = round2(Math.max(0, num(purchase.total) - nextPaid)); await tx.purchase.update({ where: { id: purchase.id }, data: { paid: nextPaid, balance: nextBalance, basePaid: round2(nextPaid * num(purchase.exchangeRate, 1)), baseBalance: round2(nextBalance * num(purchase.exchangeRate, 1)) } }); }
      await tx.supplier.update({ where: { id: supplier.id }, data: { balance: round2(Math.max(0, num(supplier.balance) - applied)) } });
      const accounting = await postGrocerySupplierPaymentAccounting(tx, { businessId: t.businessId, userId: t.userId, payment }); await writeAudit(tx, req, { businessId: t.businessId, userId: t.userId, action: "grocery.supplier_payment.post", entityType: "SupplierPayment", entityId: payment.id, after: { voucherNo, amount, purchaseId: purchase?.id || null, accounting } }); return { payment, duplicate: false, accounting };
    }); return ok(res, result, result.duplicate ? 200 : 201);
  } catch (e) { return fail(res, e); }
}
