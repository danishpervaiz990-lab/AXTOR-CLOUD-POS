import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";

const db: any = prisma;
const ENTITY_TYPE = "grocery_cheque", INDUSTRY_CODE = "grocery", DAY = 86_400_000;
const DIRECTIONS = new Set(["inward", "outward"]);
const STORED_STATUSES = new Set(["pending", "deposited", "cleared", "bounced", "cancelled", "replaced"]);
const LEGACY_STATUS_MAP: Record<string, string> = { issued: "pending", presented: "deposited", returned: "bounced", upcoming: "pending", due_today: "pending" };

function tenant(req: Request) { const businessId = req.tenant?.businessId, userId = req.tenant?.userId; if (!businessId || !userId) throw new Error("Authenticated Grocery tenant is required"); return { businessId, userId }; }
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok: true, data }); }
function fail(res: Response, message: string, status = 400, code = "INVALID_REQUEST") { return res.status(status).json({ ok: false, error: { code, message } }); }
function date(value: unknown) { if (!value) return null; const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? null : d; }
function direction(value: unknown): "inward" | "outward" | null { const d = String(value || "").trim().toLowerCase(); return DIRECTIONS.has(d) ? d as any : null; }
function status(value: unknown) { const raw = String(value || "").trim().toLowerCase(); const mapped = LEGACY_STATUS_MAP[raw] || raw; return STORED_STATUSES.has(mapped) ? mapped : null; }
function data(row: any): Record<string, any> { return row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {}; }
function dayKey(d: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
function effectiveStatus(row: any) {
  const saved = String(row.status || "pending").toLowerCase();
  if (saved !== "pending") return saved;
  if (!row.dueAt) return "upcoming";
  const due = new Date(row.dueAt), today = dayKey(new Date()), dueKey = dayKey(due);
  if (dueKey === today) return "due_today";
  return due.getTime() < Date.now() ? "overdue" : "upcoming";
}
function serialize(row: any) {
  const d = data(row);
  return { id: row.id, direction: d.direction || "inward", branchId: d.branchId || null, paymentAccountId: d.paymentAccountId || null, customerId: d.customerId || null, supplierId: d.supplierId || null,
    chequeNumber: row.referenceNo || d.chequeNumber || row.id, bankName: d.bankName || null, bankBranch: d.bankBranch || null, accountNumber: d.accountNumber || d.maskedAccount || null, maskedAccount: d.maskedAccount || null,
    drawerOrIssuer: d.drawerOrIssuer || null, payeeOrBeneficiary: d.payeeOrBeneficiary || null, amount: Number(row.amount || 0), currencyCode: row.currency || d.currencyCode || "QAR",
    issueDate: row.startAt || d.chequeDate || null, chequeDate: row.startAt || d.chequeDate || null, dueDate: row.dueAt || d.dueDate || null, depositDate: d.depositDate || null, clearingDate: d.clearingDate || null,
    bounceOrReturnDate: d.bounceOrReturnDate || null, cancellationDate: d.cancellationDate || null, replacementDate: d.replacementDate || null, replacementChequeId: d.replacementChequeId || null,
    status: effectiveStatus(row), storedStatus: row.status, reference: d.reference || null, notes: d.notes || null, allocations: Array.isArray(d.allocations) ? d.allocations : [], createdAt: row.createdAt, updatedAt: row.updatedAt };
}
function summary(rows: any[]) {
  const result: any = { inwardAmount: 0, outwardAmount: 0, pending: 0, upcoming: 0, dueToday: 0, overdue: 0, deposited: 0, cleared: 0, bounced: 0, cancelled: 0, replaced: 0, dueWithin30Days: 0 };
  for (const row of rows) { const d = data(row), amount = Number(row.amount || 0); if (d.direction === "outward") result.outwardAmount += amount; else result.inwardAmount += amount; const e = effectiveStatus(row); if (result[e] !== undefined) result[e] += 1; if (["upcoming", "due_today", "overdue", "deposited"].includes(e)) result.pending += 1; const due = row.dueAt ? new Date(row.dueAt).getTime() : NaN; if (["pending", "deposited"].includes(String(row.status)) && Number.isFinite(due) && due >= Date.now() && due <= Date.now() + 30 * DAY) result.dueWithin30Days += 1; }
  result.inwardAmount = Math.round(result.inwardAmount * 100) / 100; result.outwardAmount = Math.round(result.outwardAmount * 100) / 100; return result;
}

export async function groceryChequeList(req: Request, res: Response) {
  try {
    const t = tenant(req), where: any = { businessId: t.businessId, industryCode: INDUSTRY_CODE, entityType: ENTITY_TYPE, archivedAt: null };
    const requestedDirection = req.query.direction ? direction(req.query.direction) : null; if (req.query.direction && !requestedDirection) return fail(res, "Invalid cheque direction", 422, "INVALID_CHEQUE_DIRECTION");
    const rows = await db.industryRecord.findMany({ where, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], take: 2000 });
    let list = requestedDirection ? rows.filter((r: any) => data(r).direction === requestedDirection) : rows;
    const requestedStatus = String(req.query.status || "").trim().toLowerCase(); if (requestedStatus) list = list.filter((r: any) => effectiveStatus(r) === requestedStatus || String(r.status) === requestedStatus);
    return ok(res, { cheques: list.map(serialize), summary: summary(list) });
  } catch (e: any) { return fail(res, e?.message || "Failed to load cheques"); }
}

export async function groceryChequeCreate(req: Request, res: Response) {
  try {
    const t = tenant(req), input = req.body || {}, dir = direction(input.direction), chequeNumber = String(input.chequeNumber || "").trim(), bankName = String(input.bankName || "").trim(), paymentAccountId = String(input.paymentAccountId || "").trim(), amount = Number(input.amount), issueDate = date(input.issueDate || input.chequeDate), dueDate = date(input.dueDate);
    if (!dir) return fail(res, "Cheque direction must be inward or outward", 422, "INVALID_CHEQUE_DIRECTION"); if (!chequeNumber) return fail(res, "Cheque number is required", 422, "CHEQUE_NUMBER_REQUIRED"); if (!bankName) return fail(res, "Bank name is required", 422, "BANK_NAME_REQUIRED"); if (!paymentAccountId) return fail(res, "Payment account is required", 422, "PAYMENT_ACCOUNT_REQUIRED"); if (!Number.isFinite(amount) || amount <= 0) return fail(res, "Cheque amount must be positive", 422, "INVALID_CHEQUE_AMOUNT"); if (!issueDate || !dueDate) return fail(res, "Valid issue and due dates are required", 422, "INVALID_CHEQUE_DATE");
    const account = await db.account.findFirst({ where: { id: paymentAccountId, businessId: t.businessId, active: true } }); if (!account) return fail(res, "Payment account not found", 404, "PAYMENT_ACCOUNT_NOT_FOUND");
    if (input.customerId && !await db.customer.findFirst({ where: { id: String(input.customerId), businessId: t.businessId } })) return fail(res, "Customer not found", 404, "CUSTOMER_NOT_FOUND");
    if (input.supplierId && !await db.supplier.findFirst({ where: { id: String(input.supplierId), businessId: t.businessId } })) return fail(res, "Supplier not found", 404, "SUPPLIER_NOT_FOUND");
    const idempotencyKey = String(req.header("Idempotency-Key") || req.header("X-Idempotency-Key") || "").trim() || null;
    if (idempotencyKey) { const existing = await db.industryRecord.findFirst({ where: { businessId: t.businessId, industryCode: INDUSTRY_CODE, entityType: ENTITY_TYPE, idempotencyKey } }); if (existing) return ok(res, serialize(existing)); }
    if (await db.industryRecord.findFirst({ where: { businessId: t.businessId, industryCode: INDUSTRY_CODE, entityType: ENTITY_TYPE, referenceNo: chequeNumber, archivedAt: null } })) return fail(res, "Cheque number already exists", 409, "DUPLICATE_CHEQUE_NUMBER");
    const currency = String(input.currencyCode || input.currency || "QAR").trim().toUpperCase().slice(0, 8) || "QAR";
    const row = await db.industryRecord.create({ data: { businessId: t.businessId, industryCode: INDUSTRY_CODE, entityType: ENTITY_TYPE, referenceNo: chequeNumber, displayName: `${chequeNumber} · ${bankName}`, status: "pending", relatedEntityId: input.customerId || input.supplierId || null, startAt: issueDate, dueAt: dueDate, amount, currency, idempotencyKey, data: { direction: dir, branchId: input.branchId || null, paymentAccountId, customerId: input.customerId || null, supplierId: input.supplierId || null, chequeNumber, bankName, bankBranch: input.bankBranch || null, accountNumber: input.accountNumber || null, maskedAccount: input.maskedAccount || null, drawerOrIssuer: input.drawerOrIssuer || null, payeeOrBeneficiary: input.payeeOrBeneficiary || null, reference: input.reference || input.referenceNo || null, chequeDate: issueDate.toISOString(), dueDate: dueDate.toISOString(), notes: input.notes || null, allocations: Array.isArray(input.allocations) ? input.allocations.slice(0, 100) : [] }, createdByUserId: t.userId, updatedByUserId: t.userId } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.cheque.create", entityType: "Cheque", entityId: row.id, after: serialize(row) });
    return ok(res, serialize(row), 201);
  } catch (e: any) { return fail(res, e?.message || "Failed to create cheque"); }
}

export async function groceryChequeTransition(req: Request, res: Response) {
  try {
    const t = tenant(req), next = status(req.body?.status); if (!next || ["upcoming", "due_today"].includes(String(req.body?.status).toLowerCase())) return fail(res, "Invalid cheque transition status", 422, "INVALID_CHEQUE_STATUS");
    const row = await db.industryRecord.findFirst({ where: { id: req.params.id, businessId: t.businessId, industryCode: INDUSTRY_CODE, entityType: ENTITY_TYPE, archivedAt: null } }); if (!row) return fail(res, "Cheque not found", 404, "CHEQUE_NOT_FOUND");
    const before = serialize(row), d = data(row), timestamp = (date(req.body?.effectiveAt) || new Date()).toISOString();
    if (next === "deposited") d.depositDate = timestamp; if (next === "cleared") d.clearingDate = timestamp; if (next === "bounced") d.bounceOrReturnDate = timestamp; if (next === "cancelled") d.cancellationDate = timestamp;
    if (next === "replaced") { d.replacementDate = timestamp; d.replacementChequeId = String(req.body?.replacementChequeId || "").trim() || null; if (!d.replacementChequeId) return fail(res, "replacementChequeId is required when replacing a cheque", 422, "REPLACEMENT_CHEQUE_REQUIRED"); const replacement = await db.industryRecord.findFirst({ where: { id: d.replacementChequeId, businessId: t.businessId, industryCode: INDUSTRY_CODE, entityType: ENTITY_TYPE } }); if (!replacement) return fail(res, "Replacement cheque not found", 404, "REPLACEMENT_CHEQUE_NOT_FOUND"); }
    if (req.body?.notes !== undefined) d.notes = String(req.body.notes || "").slice(0, 1000) || null;
    const updated = await db.industryRecord.update({ where: { id: row.id }, data: { status: next, data: d, revision: { increment: 1 }, updatedByUserId: t.userId } });
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: `grocery.cheque.${next}`, entityType: "Cheque", entityId: row.id, before, after: serialize(updated) }); return ok(res, serialize(updated));
  } catch (e: any) { return fail(res, e?.message || "Failed to transition cheque"); }
}

export async function groceryChequeGenerateReminders(req: Request, res: Response) {
  try {
    const t = tenant(req), raw = Number(req.body?.days ?? 30), days = Math.min(90, Math.max(1, Number.isFinite(raw) ? Math.trunc(raw) : 30)), now = new Date(), upper = new Date(now.getTime() + days * DAY);
    const rows = await db.industryRecord.findMany({ where: { businessId: t.businessId, industryCode: INDUSTRY_CODE, entityType: ENTITY_TYPE, status: { in: ["pending", "deposited"] }, dueAt: { lte: upper }, archivedAt: null }, orderBy: { dueAt: "asc" }, take: 1000 });
    let created = 0, unchanged = 0;
    for (const row of rows) { const c = serialize(row), dueKey = c.dueDate ? dayKey(new Date(c.dueDate)) : "unknown", effective = c.status, type = `grocery_cheque_${effective}_${dueKey}`; if (await db.notification.findFirst({ where: { businessId: t.businessId, type, entityType: ENTITY_TYPE, entityId: row.id } })) { unchanged += 1; continue; } await db.notification.create({ data: { businessId: t.businessId, userId: null, type, title: `${c.direction === "outward" ? "Outgoing" : "Incoming"} cheque ${effective.replace("_", " ")}`, message: `Cheque ${c.chequeNumber} from ${c.bankName || "bank"} for ${c.currencyCode} ${Number(c.amount).toFixed(2)} is due ${dueKey}.`, entityType: ENTITY_TYPE, entityId: row.id } }); created += 1; }
    await writeAudit(db, req, { businessId: t.businessId, userId: t.userId, action: "grocery.cheque.reminders.generate", entityType: "ChequeNotification", after: { scanned: rows.length, created, unchanged, days } });
    return ok(res, { scanned: rows.length, created, unchanged, generatedAt: now.toISOString(), days });
  } catch (e: any) { return fail(res, e?.message || "Failed to generate cheque reminders"); }
}
