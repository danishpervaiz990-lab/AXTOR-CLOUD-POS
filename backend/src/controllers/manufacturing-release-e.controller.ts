import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";

const INDUSTRY = "manufacturing";
const TYPES = {
  workOrder: "manufacturing_work_order",
  issue: "manufacturing_material_issue",
  materialReturn: "manufacturing_material_return",
  stage: "manufacturing_wip_event",
  quality: "manufacturing_quality_check",
  receipt: "manufacturing_finished_goods_receipt",
  scrap: "manufacturing_scrap"
} as const;
const allowedWorkOrderStatuses = new Set(["planned", "released", "in_progress", "blocked", "completed", "cancelled"]);
const allowedQualityResults = new Set(["passed", "conditional", "failed", "rework"]);

function tenant(req: Request) { return { businessId: String(req.tenant?.businessId || ""), userId: req.tenant?.userId ? String(req.tenant.userId) : null }; }
function dataOf(row: any): Record<string, any> { return row?.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data as Record<string, any> : {}; }
function numberValue(value: unknown, fallback = 0): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function key(req: Request): string | null { return String(req.header("idempotency-key") || req.header("x-idempotency-key") || "").trim() || null; }
function reference(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`; }
function ok(res: Response, data: unknown, status = 200) { return res.status(status).json({ ok: true, data }); }
function fail(res: Response, message: string, status = 400) { return res.status(status).json({ ok: false, error: { message } }); }

async function workOrder(req: Request, id: string) {
  return prisma.industryRecord.findFirst({ where: { id, businessId: tenant(req).businessId, industryCode: INDUSTRY, entityType: TYPES.workOrder, archivedAt: null } });
}

export async function manufacturingWorkOrderDetail(req: Request, res: Response) {
  const row = await workOrder(req, String(req.params.id));
  if (!row) return fail(res, "Work order not found", 404);
  const related = await prisma.industryRecord.findMany({
    where: { businessId: tenant(req).businessId, industryCode: INDUSTRY, relatedEntityId: row.id, archivedAt: null },
    orderBy: { createdAt: "asc" }
  });
  const grouped = {
    materialIssues: related.filter(item => item.entityType === TYPES.issue),
    materialReturns: related.filter(item => item.entityType === TYPES.materialReturn),
    stages: related.filter(item => item.entityType === TYPES.stage),
    qualityChecks: related.filter(item => item.entityType === TYPES.quality),
    finishedGoodsReceipts: related.filter(item => item.entityType === TYPES.receipt),
    scrap: related.filter(item => item.entityType === TYPES.scrap)
  };
  return ok(res, { ...row, history: related, ...grouped });
}

export async function manufacturingWorkOrderUpdate(req: Request, res: Response) {
  const row = await workOrder(req, String(req.params.id));
  if (!row) return fail(res, "Work order not found", 404);
  const input = req.body || {};
  const status = input.status === undefined ? String(row.status) : String(input.status).toLowerCase();
  if (!allowedWorkOrderStatuses.has(status)) return fail(res, "Unsupported work order status");
  const current = dataOf(row);
  const nextData = {
    ...current,
    ...(input.priority !== undefined ? { priority: String(input.priority) } : {}),
    ...(input.assignedTeam !== undefined ? { assignedTeam: String(input.assignedTeam || "") || null } : {}),
    ...(input.warehouseId !== undefined ? { warehouseId: String(input.warehouseId || "") || null } : {}),
    ...(input.notes !== undefined ? { notes: String(input.notes || "") || null } : {})
  };
  const updated = await prisma.industryRecord.update({
    where: { id: row.id },
    data: {
      status,
      startAt: input.startAt === undefined ? row.startAt : input.startAt ? new Date(input.startAt) : null,
      dueAt: input.dueAt === undefined ? row.dueAt : input.dueAt ? new Date(input.dueAt) : null,
      endAt: status === "completed" ? (row.endAt || new Date()) : status === "cancelled" ? (row.endAt || new Date()) : row.endAt,
      amount: input.plannedCost === undefined ? row.amount : input.plannedCost === null || input.plannedCost === "" ? null : numberValue(input.plannedCost),
      data: nextData,
      revision: { increment: 1 },
      updatedByUserId: tenant(req).userId
    }
  });
  return ok(res, updated);
}

export async function manufacturingQualityChecks(req: Request, res: Response) {
  const rows = await prisma.industryRecord.findMany({
    where: { businessId: tenant(req).businessId, industryCode: INDUSTRY, entityType: TYPES.quality, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(numberValue(req.query.limit, 200), 1), 500)
  });
  return ok(res, rows);
}

export async function manufacturingQualityCheckCreate(req: Request, res: Response) {
  const oldKey = key(req);
  if (oldKey) {
    const existing = await prisma.industryRecord.findFirst({ where: { businessId: tenant(req).businessId, idempotencyKey: oldKey } });
    if (existing) return ok(res, existing);
  }
  const input = req.body || {};
  const order = await workOrder(req, String(input.workOrderId || ""));
  if (!order) return fail(res, "Work order not found", 404);
  const checkedQty = numberValue(input.checkedQty);
  const acceptedQty = numberValue(input.acceptedQty);
  const rejectedQty = numberValue(input.rejectedQty);
  const result = String(input.result || "").toLowerCase();
  if (!input.checkpoint || !input.inspector || checkedQty <= 0) return fail(res, "checkpoint, inspector, and positive checkedQty are required");
  if (!allowedQualityResults.has(result)) return fail(res, "Unsupported quality result");
  if (acceptedQty < 0 || rejectedQty < 0 || acceptedQty + rejectedQty > checkedQty) return fail(res, "Accepted and rejected quantities cannot exceed checked quantity");
  const orderData = dataOf(order);
  const row = await prisma.industryRecord.create({
    data: {
      businessId: tenant(req).businessId,
      industryCode: INDUSTRY,
      entityType: TYPES.quality,
      referenceNo: input.referenceNo || reference("QC"),
      displayName: `${order.referenceNo || order.displayName}: ${String(input.checkpoint)}`,
      status: result,
      relatedEntityId: order.id,
      data: {
        workOrderId: order.id,
        workOrderReference: order.referenceNo || order.id,
        productId: orderData.productId || null,
        productName: orderData.productName || null,
        checkpoint: String(input.checkpoint),
        inspector: String(input.inspector),
        checkedQty,
        acceptedQty,
        rejectedQty,
        measurements: input.measurements && typeof input.measurements === "object" && !Array.isArray(input.measurements) ? input.measurements : null,
        notes: input.notes ? String(input.notes) : null,
        checkedAt: new Date().toISOString()
      },
      idempotencyKey: oldKey,
      createdByUserId: tenant(req).userId,
      updatedByUserId: tenant(req).userId
    }
  });
  return ok(res, row, 201);
}

export async function manufacturingCostsEnhanced(req: Request, res: Response) {
  const rows = await prisma.industryRecord.findMany({
    where: { businessId: tenant(req).businessId, industryCode: INDUSTRY, entityType: { in: Object.values(TYPES) }, archivedAt: null },
    orderBy: { createdAt: "asc" }
  });
  const orders = rows.filter(row => row.entityType === TYPES.workOrder);
  const result = orders.map(order => {
    const related = rows.filter(row => row.relatedEntityId === order.id);
    const materialIssueCost = related.filter(row => row.entityType === TYPES.issue).reduce((sum, row) => sum + numberValue(row.amount), 0);
    const materialReturnCost = related.filter(row => row.entityType === TYPES.materialReturn).reduce((sum, row) => sum + numberValue(row.amount), 0);
    const stageCost = related.filter(row => row.entityType === TYPES.stage).reduce((sum, row) => sum + numberValue(row.amount), 0);
    const scrapCost = related.filter(row => row.entityType === TYPES.scrap).reduce((sum, row) => sum + numberValue(row.amount), 0);
    const finishedGoodsCost = related.filter(row => row.entityType === TYPES.receipt).reduce((sum, row) => sum + numberValue(row.amount), 0);
    const materialCost = materialIssueCost - materialReturnCost;
    const totalActualCost = materialCost + stageCost + scrapCost;
    const plannedCost = numberValue(order.amount);
    return {
      workOrderId: order.id,
      workOrderNo: order.referenceNo,
      description: order.displayName,
      materialCost,
      materialReturnCost,
      stageCost,
      scrapCost,
      finishedGoodsCost,
      totalActualCost,
      plannedCost,
      variance: totalActualCost - plannedCost,
      variancePct: plannedCost ? Number((((totalActualCost - plannedCost) / plannedCost) * 100).toFixed(2)) : null
    };
  });
  return ok(res, result);
}
