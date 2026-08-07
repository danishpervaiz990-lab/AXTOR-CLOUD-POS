import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";

const db: any = prisma;
const ENTITY_TYPE = "grocery_cheque";
const INDUSTRY_CODE = "grocery";
const ALLOWED_DIRECTIONS = new Set(["inward", "outward"]);
const ALLOWED_STATUSES = new Set(["pending", "issued", "deposited", "presented", "cleared", "bounced", "returned", "cancelled"]);

function businessId(req: Request): string {
  return req.tenant!.businessId!;
}

function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json({ ok: true, data });
}

function fail(res: Response, message: string, status = 400, code = "INVALID_REQUEST") {
  return res.status(status).json({ ok: false, error: { code, message } });
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedDirection(value: unknown): "inward" | "outward" | null {
  const direction = String(value || "").trim().toLowerCase();
  return ALLOWED_DIRECTIONS.has(direction) ? direction as "inward" | "outward" : null;
}

function normalizedStatus(value: unknown): string | null {
  const status = String(value || "").trim().toLowerCase();
  return ALLOWED_STATUSES.has(status) ? status : null;
}

function recordData(record: any): Record<string, any> {
  return record?.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data : {};
}

function serializeCheque(record: any) {
  const data = recordData(record);
  return {
    id: record.id,
    direction: data.direction || "inward",
    branchId: data.branchId || null,
    paymentAccountId: data.paymentAccountId || null,
    customerId: data.customerId || null,
    supplierId: data.supplierId || null,
    chequeNumber: record.referenceNo || data.chequeNumber || record.id,
    bankName: data.bankName || null,
    bankBranch: data.bankBranch || null,
    maskedAccount: data.maskedAccount || null,
    drawerOrIssuer: data.drawerOrIssuer || null,
    payeeOrBeneficiary: data.payeeOrBeneficiary || null,
    amount: record.amount?.toString?.() ?? String(record.amount ?? "0"),
    currencyCode: record.currency || data.currencyCode || "QAR",
    chequeDate: record.startAt?.toISOString?.() ?? data.chequeDate ?? null,
    dueDate: record.dueAt?.toISOString?.() ?? data.dueDate ?? null,
    depositDate: data.depositDate || null,
    clearingDate: data.clearingDate || null,
    bounceOrReturnDate: data.bounceOrReturnDate || null,
    cancellationDate: data.cancellationDate || null,
    status: record.status,
    notes: data.notes || null,
    allocations: Array.isArray(data.allocations) ? data.allocations : [],
    createdAt: record.createdAt?.toISOString?.() ?? record.createdAt,
    updatedAt: record.updatedAt?.toISOString?.() ?? record.updatedAt,
  };
}

function summaryFor(records: any[]) {
  const now = Date.now();
  const in30Days = now + 30 * 86_400_000;
  let inwardAmount = 0;
  let outwardAmount = 0;
  let upcoming = 0;
  let overdue = 0;
  let pending = 0;

  for (const record of records) {
    const data = recordData(record);
    const amount = Number(record.amount || 0);
    if (data.direction === "outward") outwardAmount += Number.isFinite(amount) ? amount : 0;
    else inwardAmount += Number.isFinite(amount) ? amount : 0;
    const closed = ["cleared", "cancelled"].includes(String(record.status || "").toLowerCase());
    if (!closed) {
      pending += 1;
      const due = record.dueAt ? new Date(record.dueAt).getTime() : NaN;
      if (Number.isFinite(due)) {
        if (due < now) overdue += 1;
        else if (due <= in30Days) upcoming += 1;
      }
    }
  }
  return { inwardAmount, outwardAmount, pending, dueWithin30Days: upcoming, overdue };
}

export async function groceryChequeList(req: Request, res: Response) {
  const b = businessId(req);
  const where: any = { businessId: b, industryCode: INDUSTRY_CODE, entityType: ENTITY_TYPE };
  const status = req.query.status ? normalizedStatus(req.query.status) : null;
  if (req.query.status && !status) return fail(res, "Invalid cheque status", 422, "INVALID_CHEQUE_STATUS");
  if (status) where.status = status;

  const records = await db.industryRecord.findMany({ where, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], take: 1000 });
  const direction = req.query.direction ? normalizedDirection(req.query.direction) : null;
  if (req.query.direction && !direction) return fail(res, "Invalid cheque direction", 422, "INVALID_CHEQUE_DIRECTION");
  const filtered = direction ? records.filter((record: any) => recordData(record).direction === direction) : records;
  return ok(res, { cheques: filtered.map(serializeCheque), summary: summaryFor(filtered) });
}

export async function groceryChequeCreate(req: Request, res: Response) {
  const b = businessId(req);
  const input = req.body || {};
  const direction = normalizedDirection(input.direction);
  const chequeNumber = String(input.chequeNumber || "").trim();
  const bankName = String(input.bankName || "").trim();
  const paymentAccountId = String(input.paymentAccountId || "").trim();
  const amount = Number(input.amount);
  const chequeDate = parseDate(input.chequeDate);
  const dueDate = parseDate(input.dueDate);
  if (!direction) return fail(res, "Cheque direction must be inward or outward", 422, "INVALID_CHEQUE_DIRECTION");
  if (!chequeNumber) return fail(res, "Cheque number is required", 422, "CHEQUE_NUMBER_REQUIRED");
  if (!bankName) return fail(res, "Bank name is required", 422, "BANK_NAME_REQUIRED");
  if (!paymentAccountId) return fail(res, "Payment account is required", 422, "PAYMENT_ACCOUNT_REQUIRED");
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, "Cheque amount must be positive", 422, "INVALID_CHEQUE_AMOUNT");
  if (!chequeDate || !dueDate) return fail(res, "Valid cheque and due dates are required", 422, "INVALID_CHEQUE_DATE");

  const account = await db.account.findFirst({ where: { id: paymentAccountId, businessId: b, active: true }, select: { id: true } });
  if (!account) return fail(res, "Payment account not found", 404, "PAYMENT_ACCOUNT_NOT_FOUND");
  if (input.customerId) {
    const customer = await db.customer.findFirst({ where: { id: String(input.customerId), businessId: b }, select: { id: true } });
    if (!customer) return fail(res, "Customer not found", 404, "CUSTOMER_NOT_FOUND");
  }
  if (input.supplierId) {
    const supplier = await db.supplier.findFirst({ where: { id: String(input.supplierId), businessId: b }, select: { id: true } });
    if (!supplier) return fail(res, "Supplier not found", 404, "SUPPLIER_NOT_FOUND");
  }

  const idempotencyKey = String(req.header("Idempotency-Key") || req.header("X-Idempotency-Key") || "").trim() || null;
  if (idempotencyKey) {
    const existing = await db.industryRecord.findFirst({ where: { businessId: b, idempotencyKey } });
    if (existing) return ok(res, serializeCheque(existing));
  }
  const duplicate = await db.industryRecord.findFirst({ where: { businessId: b, entityType: ENTITY_TYPE, referenceNo: chequeNumber } });
  if (duplicate) return fail(res, "Cheque number already exists", 409, "DUPLICATE_CHEQUE_NUMBER");

  const currencyCode = String(input.currencyCode || input.currency || "QAR").trim().toUpperCase().slice(0, 8) || "QAR";
  const record = await db.industryRecord.create({
    data: {
      businessId: b,
      industryCode: INDUSTRY_CODE,
      entityType: ENTITY_TYPE,
      referenceNo: chequeNumber,
      displayName: `${chequeNumber} · ${bankName}`,
      status: "pending",
      relatedEntityId: input.customerId || input.supplierId || null,
      startAt: chequeDate,
      dueAt: dueDate,
      amount,
      currency: currencyCode,
      idempotencyKey,
      data: {
        direction,
        branchId: input.branchId || null,
        paymentAccountId,
        customerId: input.customerId || null,
        supplierId: input.supplierId || null,
        chequeNumber,
        bankName,
        bankBranch: input.bankBranch || null,
        maskedAccount: input.maskedAccount || null,
        drawerOrIssuer: input.drawerOrIssuer || null,
        payeeOrBeneficiary: input.payeeOrBeneficiary || null,
        chequeDate: chequeDate.toISOString(),
        dueDate: dueDate.toISOString(),
        notes: input.notes || null,
        allocations: Array.isArray(input.allocations) ? input.allocations.slice(0, 100) : [],
      },
    },
  });
  return ok(res, serializeCheque(record), 201);
}

export async function groceryChequeTransition(req: Request, res: Response) {
  const b = businessId(req);
  const status = normalizedStatus(req.body?.status);
  if (!status) return fail(res, "Invalid cheque status", 422, "INVALID_CHEQUE_STATUS");
  const record = await db.industryRecord.findFirst({ where: { id: req.params.id, businessId: b, industryCode: INDUSTRY_CODE, entityType: ENTITY_TYPE } });
  if (!record) return fail(res, "Cheque not found", 404, "CHEQUE_NOT_FOUND");

  const data = recordData(record);
  const timestamp = new Date().toISOString();
  if (status === "deposited" || status === "presented") data.depositDate = req.body?.effectiveAt || timestamp;
  if (status === "cleared") data.clearingDate = req.body?.effectiveAt || timestamp;
  if (status === "bounced" || status === "returned") data.bounceOrReturnDate = req.body?.effectiveAt || timestamp;
  if (status === "cancelled") data.cancellationDate = req.body?.effectiveAt || timestamp;
  if (req.body?.notes !== undefined) data.notes = String(req.body.notes || "").slice(0, 1000) || null;

  const updated = await db.industryRecord.update({ where: { id: record.id }, data: { status, data, revision: { increment: 1 } } });
  return ok(res, serializeCheque(updated));
}

export async function groceryChequeGenerateReminders(req: Request, res: Response) {
  const b = businessId(req);
  const rawDays = Number(req.body?.days ?? 30);
  const days = Math.min(90, Math.max(1, Number.isFinite(rawDays) ? Math.trunc(rawDays) : 30));
  const now = new Date();
  const upper = new Date(now.getTime() + days * 86_400_000);
  const records = await db.industryRecord.findMany({
    where: {
      businessId: b,
      industryCode: INDUSTRY_CODE,
      entityType: ENTITY_TYPE,
      status: { notIn: ["cleared", "cancelled"] },
      dueAt: { gte: now, lte: upper },
    },
    orderBy: { dueAt: "asc" },
    take: 500,
  });

  let created = 0;
  let unchanged = 0;
  for (const record of records) {
    const cheque = serializeCheque(record);
    const dueKey = String(cheque.dueDate || "").slice(0, 10);
    const type = `grocery_cheque_due_${dueKey}`;
    const existing = await db.notification.findFirst({ where: { businessId: b, type, entityType: ENTITY_TYPE, entityId: record.id } });
    if (existing) { unchanged += 1; continue; }
    await db.notification.create({ data: {
      businessId: b,
      userId: null,
      type,
      title: `${cheque.direction === "outward" ? "Outgoing" : "Incoming"} cheque due ${dueKey}`,
      message: `Cheque ${cheque.chequeNumber} from ${cheque.bankName || "bank"} for ${cheque.currencyCode} ${cheque.amount} is due on ${dueKey}.`,
      entityType: ENTITY_TYPE,
      entityId: record.id,
    } });
    created += 1;
  }
  return ok(res, { scanned: records.length, created, unchanged, generatedAt: now.toISOString(), days });
}
