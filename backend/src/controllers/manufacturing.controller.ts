import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";

const INDUSTRY = "manufacturing";
const entity = {
  bom: "manufacturing_bom",
  workOrder: "manufacturing_work_order",
  issue: "manufacturing_material_issue",
  materialReturn: "manufacturing_material_return",
  stage: "manufacturing_wip_event",
  receipt: "manufacturing_finished_goods_receipt",
  scrap: "manufacturing_scrap",
  capacity: "manufacturing_capacity_plan"
} as const;

function businessId(req: Request): string { return String(req.tenant?.businessId || ""); }
function userId(req: Request): string | null { return req.tenant?.userId ? String(req.tenant.userId) : null; }
function idempotencyKey(req: Request): string | null { return String(req.header("idempotency-key") || req.header("x-idempotency-key") || "").trim() || null; }
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok: true, data }); }
function fail(res: Response, message: string, status = 400) { return res.status(status).json({ ok: false, error: { message } }); }
function number(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function ref(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`; }
function dataOf(record: any): Record<string, any> { return record?.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Record<string, any> : {}; }

async function list(req: Request, entityType: string) {
  return prisma.industryRecord.findMany({
    where: { businessId: businessId(req), industryCode: INDUSTRY, entityType, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(number(req.query.limit, 200), 1), 500)
  });
}

async function owned(req: Request, id: string, entityType?: string) {
  return prisma.industryRecord.findFirst({ where: { id, businessId: businessId(req), industryCode: INDUSTRY, ...(entityType ? { entityType } : {}), archivedAt: null } });
}

async function prior(req: Request) {
  const key = idempotencyKey(req);
  if (!key) return null;
  return prisma.industryRecord.findFirst({ where: { businessId: businessId(req), idempotencyKey: key } });
}

export async function manufacturingDashboard(req: Request, res: Response) {
  const b = businessId(req);
  const [workOrders, boms, capacity, receipts, scrap] = await Promise.all([
    prisma.industryRecord.findMany({ where: { businessId: b, industryCode: INDUSTRY, entityType: entity.workOrder, archivedAt: null } }),
    prisma.industryRecord.count({ where: { businessId: b, industryCode: INDUSTRY, entityType: entity.bom, archivedAt: null } }),
    prisma.industryRecord.findMany({ where: { businessId: b, industryCode: INDUSTRY, entityType: entity.capacity, archivedAt: null } }),
    prisma.industryRecord.findMany({ where: { businessId: b, industryCode: INDUSTRY, entityType: entity.receipt, archivedAt: null } }),
    prisma.industryRecord.findMany({ where: { businessId: b, industryCode: INDUSTRY, entityType: entity.scrap, archivedAt: null } })
  ]);
  const activeStatuses = new Set(["planned", "released", "in_progress", "blocked"]);
  const active = workOrders.filter(row => activeStatuses.has(String(row.status).toLowerCase()));
  const plannedQty = workOrders.reduce((sum, row) => sum + number(dataOf(row).plannedQty), 0);
  const completedQty = receipts.reduce((sum, row) => sum + number(dataOf(row).quantity), 0);
  const scrapQty = scrap.reduce((sum, row) => sum + number(dataOf(row).quantity), 0);
  const capacityHours = capacity.reduce((sum, row) => sum + number(dataOf(row).availableHours), 0);
  return ok(res, { boms, activeWorkOrders: active.length, plannedQty, completedQty, scrapQty, capacityHours, yieldPct: completedQty + scrapQty > 0 ? Number(((completedQty / (completedQty + scrapQty)) * 100).toFixed(2)) : 0 });
}

export async function manufacturingBoms(req: Request, res: Response) { return ok(res, await list(req, entity.bom)); }
export async function manufacturingBomCreate(req: Request, res: Response) {
  const old = await prior(req); if (old) return ok(res, old);
  const x = req.body || {};
  if (!x.productId || !x.name || !Array.isArray(x.components) || !x.components.length) return fail(res, "productId, name, and components are required");
  const product = await prisma.product.findFirst({ where: { id: String(x.productId), businessId: businessId(req), deleted: false } });
  if (!product) return fail(res, "Finished product not found", 404);
  for (const component of x.components) {
    if (!component.productId || number(component.quantity) <= 0) return fail(res, "Every BOM component requires productId and positive quantity");
    const exists = await prisma.product.findFirst({ where: { id: String(component.productId), businessId: businessId(req), deleted: false }, select: { id: true } });
    if (!exists) return fail(res, `Component product not found: ${component.productId}`, 404);
  }
  const row = await prisma.industryRecord.create({ data: { businessId: businessId(req), industryCode: INDUSTRY, entityType: entity.bom, referenceNo: x.referenceNo || ref("BOM"), displayName: String(x.name), status: x.status || "active", relatedEntityId: product.id, data: { productId: product.id, productName: product.name, outputQuantity: Math.max(number(x.outputQuantity, 1), 0.001), unit: x.unit || product.unit || "PCS", revision: Math.max(number(x.revision, 1), 1), components: x.components, notes: x.notes || null }, idempotencyKey: idempotencyKey(req), createdByUserId: userId(req), updatedByUserId: userId(req) } });
  return ok(res, row, 201);
}

export async function manufacturingWorkOrders(req: Request, res: Response) { return ok(res, await list(req, entity.workOrder)); }
export async function manufacturingWorkOrderCreate(req: Request, res: Response) {
  const old = await prior(req); if (old) return ok(res, old);
  const x = req.body || {}; const plannedQty = number(x.plannedQty);
  if (!x.productId || plannedQty <= 0) return fail(res, "productId and positive plannedQty are required");
  const product = await prisma.product.findFirst({ where: { id: String(x.productId), businessId: businessId(req), deleted: false } });
  if (!product) return fail(res, "Finished product not found", 404);
  let bom = null;
  if (x.bomId) { bom = await owned(req, String(x.bomId), entity.bom); if (!bom) return fail(res, "BOM not found", 404); }
  const row = await prisma.industryRecord.create({ data: { businessId: businessId(req), industryCode: INDUSTRY, entityType: entity.workOrder, referenceNo: x.workOrderNo || ref("WO"), displayName: String(x.name || `${product.name} production`), status: x.status || "planned", relatedEntityId: product.id, startAt: x.startAt ? new Date(x.startAt) : null, dueAt: x.dueAt ? new Date(x.dueAt) : null, amount: x.plannedCost == null ? null : number(x.plannedCost), data: { productId: product.id, productName: product.name, bomId: bom?.id || null, plannedQty, completedQty: 0, scrapQty: 0, priority: x.priority || "normal", warehouseId: x.warehouseId || null, assignedTeam: x.assignedTeam || null, notes: x.notes || null }, idempotencyKey: idempotencyKey(req), createdByUserId: userId(req), updatedByUserId: userId(req) } });
  return ok(res, row, 201);
}

async function postStock(req: Request, res: Response, mode: "issue" | "return" | "receipt") {
  const old = await prior(req); if (old) return ok(res, old);
  const workOrder = await owned(req, String(req.params.id), entity.workOrder); if (!workOrder) return fail(res, "Work order not found", 404);
  const x = req.body || {}; const items = mode === "receipt" ? [{ productId: x.productId || dataOf(workOrder).productId, quantity: x.quantity, warehouseId: x.warehouseId }] : x.items;
  if (!Array.isArray(items) || !items.length) return fail(res, mode === "receipt" ? "Positive finished-goods quantity is required" : "Items are required");
  const key = idempotencyKey(req); const recordType = mode === "issue" ? entity.issue : mode === "return" ? entity.materialReturn : entity.receipt;
  try {
    const row = await prisma.$transaction(async tx => {
      const posted: any[] = []; let totalCost = 0;
      for (const item of items) {
        const quantity = number(item.quantity);
        if (!item.productId || quantity <= 0) throw new Error("Every item requires productId and positive quantity");
        const product = await tx.product.findFirst({ where: { id: String(item.productId), businessId: businessId(req), deleted: false } });
        if (!product) throw new Error(`Product not found: ${item.productId}`);
        const before = number(product.currentStock); const delta = mode === "issue" ? -quantity : quantity; const after = before + delta;
        if (after < 0) throw new Error(`Insufficient stock for ${product.name}`);
        await tx.product.update({ where: { id: product.id }, data: { currentStock: after } });
        await tx.stockMovement.create({ data: { businessId: businessId(req), movementNo: ref(mode === "issue" ? "MFG-ISS" : mode === "return" ? "MFG-RET" : "MFG-FG"), productId: product.id, sku: product.sku, productName: product.name, warehouseId: item.warehouseId || dataOf(workOrder).warehouseId || null, direction: mode === "issue" ? "OUT" : "IN", movementType: `manufacturing_${mode}`, referenceNo: workOrder.referenceNo, qty: quantity, beforeQty: before, afterQty: after, source: "manufacturing", metadata: { workOrderId: workOrder.id } } });
        const cost = quantity * number(product.costPrice); totalCost += cost; posted.push({ productId: product.id, sku: product.sku, productName: product.name, quantity, unitCost: number(product.costPrice), cost, beforeQty: before, afterQty: after, warehouseId: item.warehouseId || null });
      }
      const created = await tx.industryRecord.create({ data: { businessId: businessId(req), industryCode: INDUSTRY, entityType: recordType, referenceNo: ref(mode === "issue" ? "ISS" : mode === "return" ? "RET" : "FGR"), displayName: `${workOrder.referenceNo || workOrder.displayName} ${mode}`, status: "posted", relatedEntityId: workOrder.id, amount: totalCost, data: { workOrderId: workOrder.id, items: posted, quantity: posted.reduce((sum, item) => sum + item.quantity, 0), postedAt: new Date().toISOString(), notes: x.notes || null }, idempotencyKey: key, createdByUserId: userId(req), updatedByUserId: userId(req) } });
      if (mode === "receipt") {
        const current = dataOf(workOrder); const completedQty = number(current.completedQty) + posted.reduce((sum, item) => sum + item.quantity, 0); const plannedQty = number(current.plannedQty);
        await tx.industryRecord.update({ where: { id: workOrder.id }, data: { status: completedQty >= plannedQty ? "completed" : "in_progress", endAt: completedQty >= plannedQty ? new Date() : workOrder.endAt, revision: { increment: 1 }, updatedByUserId: userId(req), data: { ...current, completedQty } } });
      }
      return created;
    });
    return ok(res, row, 201);
  } catch (error) { return fail(res, error instanceof Error ? error.message : "Stock posting failed", 409); }
}

export async function manufacturingMaterialIssue(req: Request, res: Response) { return postStock(req, res, "issue"); }
export async function manufacturingMaterialReturn(req: Request, res: Response) { return postStock(req, res, "return"); }
export async function manufacturingFinishedGoods(req: Request, res: Response) { return postStock(req, res, "receipt"); }

export async function manufacturingStageCreate(req: Request, res: Response) {
  const old = await prior(req); if (old) return ok(res, old);
  const workOrder = await owned(req, String(req.params.id), entity.workOrder); if (!workOrder) return fail(res, "Work order not found", 404);
  const x = req.body || {}; if (!x.stage || !x.status) return fail(res, "stage and status are required");
  const row = await prisma.$transaction(async tx => {
    const event = await tx.industryRecord.create({ data: { businessId: businessId(req), industryCode: INDUSTRY, entityType: entity.stage, referenceNo: ref("WIP"), displayName: `${workOrder.referenceNo || workOrder.displayName}: ${x.stage}`, status: String(x.status), relatedEntityId: workOrder.id, startAt: x.startedAt ? new Date(x.startedAt) : new Date(), endAt: x.completedAt ? new Date(x.completedAt) : null, amount: x.actualCost == null ? null : number(x.actualCost), data: { workOrderId: workOrder.id, stage: x.stage, status: x.status, completedQty: number(x.completedQty), machine: x.machine || null, operator: x.operator || null, actualHours: number(x.actualHours), notes: x.notes || null }, idempotencyKey: idempotencyKey(req), createdByUserId: userId(req), updatedByUserId: userId(req) } });
    await tx.industryRecord.update({ where: { id: workOrder.id }, data: { status: x.workOrderStatus || (x.status === "completed" ? "in_progress" : x.status), revision: { increment: 1 }, updatedByUserId: userId(req) } });
    return event;
  });
  return ok(res, row, 201);
}

export async function manufacturingScrapCreate(req: Request, res: Response) {
  const old = await prior(req); if (old) return ok(res, old);
  const workOrder = await owned(req, String(req.params.id), entity.workOrder); if (!workOrder) return fail(res, "Work order not found", 404);
  const x = req.body || {}; const quantity = number(x.quantity); if (quantity <= 0 || !x.reason) return fail(res, "Positive quantity and reason are required");
  const row = await prisma.$transaction(async tx => {
    const record = await tx.industryRecord.create({ data: { businessId: businessId(req), industryCode: INDUSTRY, entityType: entity.scrap, referenceNo: ref("SCRAP"), displayName: `${workOrder.referenceNo || workOrder.displayName} scrap`, status: x.status || "recorded", relatedEntityId: workOrder.id, amount: x.cost == null ? null : number(x.cost), data: { workOrderId: workOrder.id, quantity, reason: x.reason, disposition: x.disposition || "discard", notes: x.notes || null }, idempotencyKey: idempotencyKey(req), createdByUserId: userId(req), updatedByUserId: userId(req) } });
    const current = dataOf(workOrder); await tx.industryRecord.update({ where: { id: workOrder.id }, data: { revision: { increment: 1 }, updatedByUserId: userId(req), data: { ...current, scrapQty: number(current.scrapQty) + quantity } } });
    return record;
  });
  return ok(res, row, 201);
}

export async function manufacturingWip(req: Request, res: Response) {
  const [orders, stages] = await Promise.all([list(req, entity.workOrder), list(req, entity.stage)]);
  return ok(res, orders.filter(row => ["released", "in_progress", "blocked"].includes(String(row.status).toLowerCase())).map(order => ({ ...order, stages: stages.filter(stage => stage.relatedEntityId === order.id) })));
}

export async function manufacturingCapacity(req: Request, res: Response) { return ok(res, await list(req, entity.capacity)); }
export async function manufacturingCapacityCreate(req: Request, res: Response) {
  const old = await prior(req); if (old) return ok(res, old);
  const x = req.body || {}; if (!x.resource || !x.period || number(x.availableHours) < 0) return fail(res, "resource, period, and non-negative availableHours are required");
  const row = await prisma.industryRecord.create({ data: { businessId: businessId(req), industryCode: INDUSTRY, entityType: entity.capacity, referenceNo: x.referenceNo || ref("CAP"), displayName: `${x.resource} ${x.period}`, status: x.status || "active", startAt: x.startAt ? new Date(x.startAt) : null, endAt: x.endAt ? new Date(x.endAt) : null, data: { resource: x.resource, period: x.period, availableHours: number(x.availableHours), plannedHours: number(x.plannedHours), machineCount: number(x.machineCount), shiftCount: number(x.shiftCount), notes: x.notes || null }, idempotencyKey: idempotencyKey(req), createdByUserId: userId(req), updatedByUserId: userId(req) } });
  return ok(res, row, 201);
}

export async function manufacturingCosts(req: Request, res: Response) {
  const b = businessId(req); const rows = await prisma.industryRecord.findMany({ where: { businessId: b, industryCode: INDUSTRY, entityType: { in: [entity.workOrder, entity.issue, entity.receipt, entity.scrap, entity.stage] }, archivedAt: null }, orderBy: { createdAt: "desc" } });
  const byWorkOrder = new Map<string, any>();
  for (const row of rows) {
    const workOrderId = row.entityType === entity.workOrder ? row.id : String(dataOf(row).workOrderId || row.relatedEntityId || ""); if (!workOrderId) continue;
    const current = byWorkOrder.get(workOrderId) || { workOrderId, materialCost: 0, stageCost: 0, scrapCost: 0, finishedGoodsCost: 0, totalActualCost: 0 };
    const amount = number(row.amount); if (row.entityType === entity.issue) current.materialCost += amount; if (row.entityType === entity.stage) current.stageCost += amount; if (row.entityType === entity.scrap) current.scrapCost += amount; if (row.entityType === entity.receipt) current.finishedGoodsCost += amount; current.totalActualCost = current.materialCost + current.stageCost + current.scrapCost; byWorkOrder.set(workOrderId, current);
  }
  return ok(res, Array.from(byWorkOrder.values()));
}

export async function manufacturingReports(req: Request, res: Response) {
  const [dashboard, orders, issues, receipts, scrap, capacity] = await Promise.all([prisma.industryRecord.findMany({ where: { businessId: businessId(req), industryCode: INDUSTRY, archivedAt: null } }), list(req, entity.workOrder), list(req, entity.issue), list(req, entity.receipt), list(req, entity.scrap), list(req, entity.capacity)]);
  return ok(res, { recordCount: dashboard.length, workOrders: orders.length, materialIssues: issues.length, finishedGoodsReceipts: receipts.length, scrapRecords: scrap.length, capacityPlans: capacity.length, statusBreakdown: orders.reduce((acc: Record<string, number>, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {}) });
}

export async function manufacturingSettings(req: Request, res: Response) {
  const row = await prisma.industrySetting.findUnique({ where: { businessId_key: { businessId: businessId(req), key: "manufacturing.settings" } } }); return ok(res, row?.value || {});
}
export async function manufacturingSettingsUpdate(req: Request, res: Response) {
  const row = await prisma.industrySetting.upsert({ where: { businessId_key: { businessId: businessId(req), key: "manufacturing.settings" } }, create: { businessId: businessId(req), key: "manufacturing.settings", value: req.body || {} }, update: { value: req.body || {} } }); return ok(res, row.value);
}
