import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";

const db: any = prisma;
const DAY = 86_400_000;
function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function json(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function dayStart(date = new Date()) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function parseDate(value: unknown) { if (!value) return null; const d = new Date(String(value)); return Number.isNaN(d.getTime()) ? null : dayStart(d); }
function percentage(value: number, total: number) { return total === 0 ? 0 : round2(value / total * 100); }
async function readSetting(businessId: string, key: string, fallback: unknown) { const row = await db.appSetting.findFirst({ where: { businessId, key } }); if (!row) return fallback; const v = row.value; return json(v).value ?? v ?? fallback; }

export async function groceryExpiryV2(req: Request, res: Response) {
  try {
    const businessId = req.tenant?.businessId;
    if (!businessId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
    const windowValue = text(req.query.window || req.query.days || "30").toLowerCase();
    const warehouseId = text(req.query.warehouseId);
    const category = text(req.query.category).toLowerCase();
    const supplierId = text(req.query.supplierId);
    const batches = await db.inventoryBatch.findMany({
      where: { businessId, qtyOnHandBase: { gt: 0 }, ...(warehouseId ? { warehouseId } : {}) },
      include: { product: true, warehouse: true },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
      take: 10000,
    });
    const now = dayStart();
    let from: Date | null = parseDate(req.query.from);
    let to: Date | null = parseDate(req.query.to);
    if (from || to) {
      if (from && to && from > to) return res.status(422).json({ ok: false, error: { message: "Expiry from date cannot be after to date" } });
      if (to) to = new Date(to.getTime() + DAY - 1);
    } else if (windowValue === "expired") {
      to = new Date(now.getTime() - 1);
    } else if (windowValue === "today") {
      from = now; to = new Date(now.getTime() + DAY - 1);
    } else {
      const days = Math.max(1, Math.min(3650, Math.trunc(num(windowValue, 30))));
      from = now; to = new Date(now.getTime() + days * DAY + DAY - 1);
    }
    const totalInventoryValue = round2(batches.reduce((sum: number, b: any) => sum + num(b.qtyOnHandBase) * num(b.costPerBaseUnit), 0));
    const rows = batches.filter((b: any) => {
      if (!b.expiryDate) return false;
      const d = new Date(b.expiryDate);
      const md = json(b.metadata);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (category && String(b.product?.category || "").toLowerCase() !== category) return false;
      if (supplierId && String(md.supplierId || "") !== supplierId) return false;
      return true;
    }).map((b: any) => {
      const md = json(b.metadata);
      const value = round2(num(b.qtyOnHandBase) * num(b.costPerBaseUnit));
      const daysToExpiry = Math.floor((dayStart(new Date(b.expiryDate)).getTime() - now.getTime()) / DAY);
      return {
        id: b.id, productId: b.productId, product: b.product?.name || null, sku: b.product?.sku || null,
        category: b.product?.category || null, supplierId: md.supplierId || null, supplier: md.supplierName || null,
        purchaseReference: md.purchaseNo || md.purchaseReference || null, warehouseId: b.warehouseId, warehouse: b.warehouse?.name || null,
        batch: b.batchNo, manufacturingDate: b.productionDate, expiryDate: b.expiryDate, quantity: num(b.qtyOnHandBase), reserved: num(b.qtyReservedBase),
        receivedCost: num(b.costPerBaseUnit), expiryValue: value, percentageOfInventoryValue: percentage(value, totalInventoryValue), daysToExpiry,
        expiryStatus: daysToExpiry < 0 ? "Expired" : daysToExpiry === 0 ? "Expiring Today" : `Expiring in ${daysToExpiry} days`,
      };
    });
    const expiryValue = round2(rows.reduce((sum: number, row: any) => sum + row.expiryValue, 0));
    const settings = {
      warningDays: Math.max(0, Math.trunc(num(await readSetting(businessId, "inventory.expiryWarningDays", 30), 30))),
      blockExpiredSales: Boolean(await readSetting(businessId, "inventory.blockExpiredSales", true)),
      warnNearExpirySale: Boolean(await readSetting(businessId, "inventory.warnNearExpirySale", true)),
      managerNearExpiryOverride: Boolean(await readSetting(businessId, "inventory.managerNearExpiryOverride", true)),
      fefoEnabled: Boolean(await readSetting(businessId, "inventory.fefoEnabled", true)),
    };
    return res.json({ ok: true, data: { window: windowValue, from, to, totalInventoryValue, expiryValue, percentageOfTotalInventoryValue: percentage(expiryValue, totalInventoryValue), count: rows.length, rows, settings } });
  } catch (error: any) { return res.status(500).json({ ok: false, error: { message: error?.message || "Failed to load expiry management" } }); }
}

export async function updateGroceryExpirySettings(req: Request, res: Response) {
  try {
    const businessId = req.tenant?.businessId;
    const userId = req.tenant?.userId;
    if (!businessId || !userId) return res.status(401).json({ ok: false, error: { message: "Unauthorized" } });
    const input = req.body || {};
    const values: Record<string, unknown> = {
      "inventory.expiryWarningDays": Math.max(0, Math.min(3650, Math.trunc(num(input.warningDays, 30)))),
      "inventory.blockExpiredSales": input.blockExpiredSales !== false,
      "inventory.warnNearExpirySale": input.warnNearExpirySale !== false,
      "inventory.managerNearExpiryOverride": input.managerNearExpiryOverride !== false,
      "inventory.fefoEnabled": input.fefoEnabled !== false,
    };
    for (const [key, value] of Object.entries(values)) {
      const existing = await db.appSetting.findFirst({ where: { businessId, key } });
      if (existing) await db.appSetting.update({ where: { id: existing.id }, data: { value } });
      else await db.appSetting.create({ data: { businessId, key, value } });
    }
    await writeAudit(db, req, { businessId, userId, action: "grocery.expiry.settings.update", entityType: "AppSetting", entityId: "inventory.expiry", after: values });
    return res.json({ ok: true, data: values });
  } catch (error: any) { return res.status(500).json({ ok: false, error: { message: error?.message || "Failed to update expiry settings" } }); }
}
