import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";
import { nextEntityNumber } from "../services/numbering.service.js";

const db: any = prisma;
function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function json(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function serialize(row: any) { return { id: row.id, referenceNo: row.referenceNo, displayName: row.displayName, status: row.status, customerId: row.relatedEntityId, amount: num(row.amount), currency: row.currency, data: json(row.data), createdAt: row.createdAt, updatedAt: row.updatedAt }; }

export async function groceryHeldSaleListV2(req: Request, res: Response) {
  try {
    const businessId = req.tenant?.businessId;
    if (!businessId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
    const rows = await db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_held_sale", archivedAt: null }, orderBy: { updatedAt: "desc" }, take: 200 });
    return res.json({ ok: true, data: rows.map(serialize) });
  } catch (error: any) { return res.status(500).json({ ok: false, error: { message: error?.message || "Failed to load held sales" } }); }
}

export async function groceryHeldSaleCreateV2(req: Request, res: Response) {
  try {
    const businessId = req.tenant?.businessId;
    const userId = req.tenant?.userId;
    if (!businessId || !userId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
    const input = req.body || {};
    const items = Array.isArray(input.items) ? input.items : [];
    if (!items.length) return res.status(422).json({ ok: false, error: { message: "Held sale must contain at least one item" } });

    const record = await db.$transaction(async (tx: any) => {
      const manualReference = text(input.referenceNo);
      let referenceNo = manualReference;
      if (manualReference) {
        const duplicate = await tx.industryRecord.findFirst({ where: { businessId, industryCode: "grocery", entityType: "grocery_held_sale", referenceNo: manualReference, archivedAt: null } });
        if (duplicate) throw new Error("Held sale reference already exists");
      } else {
        referenceNo = await nextEntityNumber(tx, "industryRecord", "referenceNo", businessId, "HOLD", 6, {
          sequenceKey: "grocery.held_sale",
          where: { industryCode: "grocery", entityType: "grocery_held_sale" },
        });
      }

      const created = await tx.industryRecord.create({
        data: {
          businessId,
          industryCode: "grocery",
          entityType: "grocery_held_sale",
          referenceNo,
          displayName: text(input.name) || referenceNo,
          status: "held",
          relatedEntityId: text(input.customerId) || null,
          amount: round2(num(input.total)),
          currency: text(input.currency || "QAR").toUpperCase(),
          data: {
            items: items.slice(0, 500),
            payments: Array.isArray(input.payments) ? input.payments.slice(0, 20) : [],
            branchId: input.branchId || null,
            warehouseId: input.warehouseId || null,
            counterId: input.counterId || null,
            salespersonId: input.salespersonId || null,
            dueDate: input.dueDate || null,
            invoiceDiscount: num(input.invoiceDiscount),
            invoiceDiscountType: text(input.invoiceDiscountType) || "fixed",
            promotionDiscount: num(input.promotionDiscount),
            notes: text(input.notes) || null,
            creditOverrideReason: text(input.creditOverrideReason) || null,
          },
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      });
      await writeAudit(tx, req, { businessId, userId, action: "grocery.sale.hold", entityType: "IndustryRecord", entityId: created.id, after: { referenceNo, lineCount: items.length, amount: num(input.total), autoAllocated: !manualReference } });
      return created;
    });
    return res.status(201).json({ ok: true, data: serialize(record) });
  } catch (error: any) { return res.status(500).json({ ok: false, error: { message: error?.message || "Failed to hold sale" } }); }
}

export async function groceryHeldSaleDeleteV2(req: Request, res: Response) {
  try {
    const businessId = req.tenant?.businessId;
    const userId = req.tenant?.userId;
    if (!businessId || !userId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
    const row = await db.industryRecord.findFirst({ where: { id: req.params.id, businessId, industryCode: "grocery", entityType: "grocery_held_sale", archivedAt: null } });
    if (!row) return res.status(404).json({ ok: false, error: { message: "Held sale not found" } });
    const status = text(req.body?.status) || "recalled";
    await db.industryRecord.update({ where: { id: row.id }, data: { archivedAt: new Date(), status, revision: { increment: 1 }, updatedByUserId: userId } });
    await writeAudit(db, req, { businessId, userId, action: "grocery.sale.hold.release", entityType: "IndustryRecord", entityId: row.id, after: { status } });
    return res.json({ ok: true, data: { id: row.id, released: true, status } });
  } catch (error: any) { return res.status(500).json({ ok: false, error: { message: error?.message || "Failed to release held sale" } }); }
}
