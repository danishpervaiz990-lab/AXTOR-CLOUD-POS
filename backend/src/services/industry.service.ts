import type { Request } from "express";
import { prisma } from "../db/prisma.js";
import { getIndustryEntity, getIndustryPack, publicIndustryRegistry, type IndustryEntityDefinition, type IndustryPack } from "../industry/registry.js";
import { hasPermission, loadUserAccess, type UserAccess } from "./access.service.js";
import { writeAudit } from "./audit.service.js";
import { ApiError, cleanString, dateValue, numberValue, plain, queryLimit, requireText } from "../utils/http.js";

function objectValue(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function authorize(access: UserAccess, permission: string, legacyDefault = false): void {
  if (!hasPermission(access, permission, legacyDefault)) throw new ApiError(403, `Permission denied: ${permission}`);
}

async function selectedPack(tx: any, businessId: string): Promise<{ pack: IndustryPack; industryId: string }> {
  const selection = await tx.businessIndustry.findUnique({ where: { businessId }, include: { industry: true } });
  const pack = getIndustryPack(selection?.industry?.code);
  if (!selection || !pack) throw new ApiError(409, "Complete tenant onboarding and select a supported industry first");
  return { pack, industryId: selection.industryId };
}

function definitionFor(pack: IndustryPack, entityType: unknown): IndustryEntityDefinition {
  const definition = getIndustryEntity(pack, String(entityType || ""));
  if (!definition) throw new ApiError(400, `Entity type is unavailable for the ${pack.name} industry`);
  return definition;
}

function validateData(definition: IndustryEntityDefinition, raw: unknown): Record<string, any> {
  const data = objectValue(raw);
  const allowed = new Set(definition.fields.map(item => item.key));
  const output: Record<string, any> = {};
  for (const field of definition.fields) {
    let value = data[field.key];
    if (field.required && (value === undefined || value === null || String(value).trim() === "" || (field.type === "boolean" && value !== true))) {
      throw new ApiError(400, `${field.label} is required`);
    }
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "number") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new ApiError(400, `${field.label} must be a number`);
      value = parsed;
    } else if (field.type === "boolean") {
      value = Boolean(value);
    } else if (field.type === "date" || field.type === "datetime") {
      const parsed = dateValue(value);
      if (!parsed) throw new ApiError(400, `${field.label} must be a valid date`);
      value = parsed.toISOString();
    } else {
      value = String(value).trim().slice(0, field.type === "textarea" ? 20000 : 500);
    }
    if (field.options && !field.options.includes(String(value))) throw new ApiError(400, `${field.label} has an unsupported value`);
    output[field.key] = value;
  }
  for (const key of Object.keys(data)) if (allowed.has(key) && !Object.prototype.hasOwnProperty.call(output, key) && data[key] === false) output[key] = false;
  const bytes = Buffer.byteLength(JSON.stringify(output), "utf8");
  if (bytes > 128 * 1024) throw new ApiError(413, "Industry record data is too large");
  return output;
}

function displayName(definition: IndustryEntityDefinition, data: Record<string, any>, input: any): string {
  const candidate = cleanString(input?.displayName)
    || cleanString(data.fullName)
    || cleanString(data.memberNo)
    || cleanString(data.patientNo)
    || cleanString(data.admissionNo)
    || cleanString(data.projectReference)
    || cleanString(data.reference)
    || cleanString(data.colorCode);
  return candidate || definition.label;
}

function derivedDates(data: Record<string, any>, input: any) {
  return {
    startAt: dateValue(input?.startAt || data.startAt || data.startDate || data.joinDate || data.openedAt || data.startedAt || data.checkInAt) || null,
    endAt: dateValue(input?.endAt || data.endAt || data.endDate || data.validUntil || data.checkOutAt) || null,
    dueAt: dateValue(input?.dueAt || data.dueAt || data.dueDate || data.endDate || data.validUntil) || null,
  };
}

async function validateScheduleConflicts(
  tx: any,
  businessId: string,
  industryCode: string,
  definition: IndustryEntityDefinition,
  data: Record<string, any>,
  startAt: Date | null,
  endAt: Date | null,
  excludeId?: string,
) {
  const keysByType: Record<string, string[]> = {
    gym_facility_booking: ["facility"],
    clinic_appointment: ["practitionerReference", "location"],
    school_timetable: ["teacherReference", "room", "classSection"],
  };
  const keys = keysByType[definition.type];
  if (!keys || !startAt || !endAt || endAt <= startAt) return;
  const overlaps = await tx.industryRecord.findMany({
    where: {
      businessId,
      industryCode,
      entityType: definition.type,
      archivedAt: null,
      id: excludeId ? { not: excludeId } : undefined,
      status: { notIn: ["cancelled", "completed", "no_show"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true, referenceNo: true, data: true },
    take: 100,
  });
  const conflict = overlaps.find((row: any) => {
    const existing = objectValue(row.data);
    return keys.some(key => cleanString(data[key]) && String(existing[key] || "").toLowerCase() === String(data[key]).toLowerCase());
  });
  if (conflict) throw new ApiError(409, `Schedule conflicts with ${conflict.referenceNo || conflict.id}`);
}

function redact(record: any, definition: IndustryEntityDefinition, access: UserAccess) {
  const mayReadSensitive = hasPermission(access, `${definition.permission}.sensitive`) || access.isOwner || access.isAdmin;
  const output = plain(record);
  if (!mayReadSensitive && output?.data) {
    output.data = { ...output.data };
    for (const field of definition.fields.filter(item => item.sensitive)) if (Object.prototype.hasOwnProperty.call(output.data, field.key)) output.data[field.key] = "[restricted]";
  }
  return output;
}

export async function registry(businessId: string, userId: string | null) {
  const access = await loadUserAccess(prisma, businessId, userId);
  const selection = await prisma.businessIndustry.findUnique({ where: { businessId }, include: { industry: true } });
  const pack = getIndustryPack(selection?.industry?.code);
  return plain({
    selected: pack,
    selection: selection ? { industryId: selection.industryId, selectedAt: selection.selectedAt, code: selection.industry.code, name: selection.industry.name } : null,
    available: publicIndustryRegistry().map(item => ({ code: item.code, name: item.name, description: item.description, modules: item.modules })),
    permissions: [...access.permissions],
    canManage: access.isOwner || access.isAdmin || hasPermission(access, "industry.*"),
    medicalAndMedicationNotice: "Sensitive health and medication records require configured consent, least-privilege access, retention rules, and jurisdiction-specific validation. The system does not provide diagnosis or autonomous medicine advice.",
  });
}

export async function listRecords(businessId: string, userId: string | null, query: any) {
  const access = await loadUserAccess(prisma, businessId, userId);
  const { pack } = await selectedPack(prisma, businessId);
  const definition = definitionFor(pack, query.entityType);
  authorize(access, `${definition.permission}.view`, true);
  const status = cleanString(query.status);
  const search = cleanString(query.q);
  const dueFrom = dateValue(query.dueFrom);
  const dueTo = dateValue(query.dueTo);
  const createdFrom = dateValue(query.createdFrom);
  const createdTo = dateValue(query.createdTo);
  const offset = Math.max(0, Math.min(10_000, Math.trunc(numberValue(query.offset, 0))));
  const rows = await prisma.industryRecord.findMany({
    where: {
      businessId,
      industryCode: pack.code,
      entityType: definition.type,
      archivedAt: query.includeArchived === "true" ? undefined : null,
      ...(status ? { status } : {}),
      ...(search ? { OR: [{ displayName: { contains: search, mode: "insensitive" } }, { referenceNo: { contains: search, mode: "insensitive" } }] } : {}),
      ...(dueFrom || dueTo ? { dueAt: { ...(dueFrom ? { gte: dueFrom } : {}), ...(dueTo ? { lte: dueTo } : {}) } } : {}),
      ...(createdFrom || createdTo ? { createdAt: { ...(createdFrom ? { gte: createdFrom } : {}), ...(createdTo ? { lte: createdTo } : {}) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: queryLimit(query.limit, 100, 500),
  });
  return rows.map(row => redact(row, definition, access));
}

export async function getRecord(businessId: string, userId: string | null, id: string) {
  const access = await loadUserAccess(prisma, businessId, userId);
  const { pack } = await selectedPack(prisma, businessId);
  const row = await prisma.industryRecord.findFirst({ where: { id, businessId, industryCode: pack.code } });
  if (!row) throw new ApiError(404, "Industry record not found");
  const definition = definitionFor(pack, row.entityType);
  authorize(access, `${definition.permission}.view`, true);
  return redact(row, definition, access);
}

export async function createRecord(req: Request, businessId: string, userId: string | null, input: any) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId);
    const { pack } = await selectedPack(tx, businessId);
    const definition = definitionFor(pack, input?.entityType);
    authorize(access, `${definition.permission}.create`, true);
    const idempotencyKey = cleanString(req.header("Idempotency-Key") || req.header("X-Idempotency-Key") || input?.idempotencyKey);
    if (idempotencyKey) {
      const existing = await tx.industryRecord.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey } } });
      if (existing) return redact(existing, definition, access);
    }
    const data = validateData(definition, input?.data);
    const status = String(input?.status || definition.statuses[0] || "active").toLowerCase();
    if (!definition.statuses.includes(status)) throw new ApiError(400, "Unsupported workflow status");
    const dates = derivedDates(data, input);
    await validateScheduleConflicts(tx, businessId, pack.code, definition, data, dates.startAt, dates.endAt);
    let row = await tx.industryRecord.create({
      data: {
        businessId,
        industryCode: pack.code,
        entityType: definition.type,
        referenceNo: cleanString(input?.referenceNo) || null,
        displayName: displayName(definition, data, input),
        status,
        relatedEntityId: cleanString(input?.relatedEntityId) || null,
        ...dates,
        amount: input?.amount === undefined || input?.amount === null || input?.amount === "" ? null : numberValue(input.amount),
        currency: cleanString(input?.currency) || null,
        data,
        idempotencyKey: idempotencyKey || null,
        createdByUserId: access.userId,
        updatedByUserId: access.userId,
      },
    });
    if (!row.referenceNo) {
      const prefix = definition.type.split("_").map(part => part[0]).join("").toUpperCase().slice(0, 5);
      row = await tx.industryRecord.update({ where: { id: row.id }, data: { referenceNo: `${prefix}-${row.id.slice(-8).toUpperCase()}` } });
    }
    await writeAudit(tx, req, { businessId, userId: access.userId, action: `${definition.permission}.create`, entityType: "IndustryRecord", entityId: row.id, after: { entityType: row.entityType, referenceNo: row.referenceNo, status: row.status } });
    return redact(row, definition, access);
  });
}

export async function updateRecord(req: Request, businessId: string, userId: string | null, id: string, input: any) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId);
    const { pack } = await selectedPack(tx, businessId);
    const current = await tx.industryRecord.findFirst({ where: { id, businessId, industryCode: pack.code } });
    if (!current) throw new ApiError(404, "Industry record not found");
    const definition = definitionFor(pack, current.entityType);
    authorize(access, `${definition.permission}.update`, true);
    const expectedRevision = Number(input?.revision ?? current.revision);
    if (expectedRevision !== current.revision) throw new ApiError(409, "This record changed on another device; reload before saving");
    const data = input?.data === undefined ? objectValue(current.data) : validateData(definition, input.data);
    const status = String(input?.status || current.status).toLowerCase();
    if (!definition.statuses.includes(status)) throw new ApiError(400, "Unsupported workflow status");
    const dates = derivedDates(data, input);
    await validateScheduleConflicts(tx, businessId, pack.code, definition, data, dates.startAt, dates.endAt, id);
    const result = await tx.industryRecord.updateMany({
      where: { id, businessId, revision: current.revision },
      data: {
        displayName: displayName(definition, data, input),
        status,
        relatedEntityId: input?.relatedEntityId === undefined ? current.relatedEntityId : cleanString(input.relatedEntityId) || null,
        ...dates,
        amount: input?.amount === undefined ? current.amount : input.amount === null || input.amount === "" ? null : numberValue(input.amount),
        currency: input?.currency === undefined ? current.currency : cleanString(input.currency) || null,
        data,
        revision: { increment: 1 },
        updatedByUserId: access.userId,
      },
    });
    if (!result.count) throw new ApiError(409, "This record changed on another device; reload before saving");
    const row = await tx.industryRecord.findUniqueOrThrow({ where: { id } });
    await writeAudit(tx, req, { businessId, userId: access.userId, action: `${definition.permission}.update`, entityType: "IndustryRecord", entityId: id, before: { status: current.status, revision: current.revision }, after: { status: row.status, revision: row.revision } });
    return redact(row, definition, access);
  });
}

export async function archiveRecord(req: Request, businessId: string, userId: string | null, id: string) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId);
    const { pack } = await selectedPack(tx, businessId);
    const current = await tx.industryRecord.findFirst({ where: { id, businessId, industryCode: pack.code } });
    if (!current) throw new ApiError(404, "Industry record not found");
    const definition = definitionFor(pack, current.entityType);
    authorize(access, `${definition.permission}.archive`, true);
    const row = await tx.industryRecord.update({ where: { id }, data: { archivedAt: new Date(), status: "archived", revision: { increment: 1 }, updatedByUserId: access.userId } });
    await writeAudit(tx, req, { businessId, userId: access.userId, action: `${definition.permission}.archive`, entityType: "IndustryRecord", entityId: id, before: { status: current.status }, after: { status: row.status } });
    return plain(row);
  });
}

export async function summary(businessId: string, userId: string | null) {
  const access = await loadUserAccess(prisma, businessId, userId);
  const { pack } = await selectedPack(prisma, businessId);
  authorize(access, `industry.${pack.code}.view`, true);
  const [total, grouped, dueSoon, overdue] = await Promise.all([
    prisma.industryRecord.count({ where: { businessId, industryCode: pack.code, archivedAt: null } }),
    prisma.industryRecord.groupBy({ by: ["entityType", "status"], where: { businessId, industryCode: pack.code, archivedAt: null }, _count: { _all: true } }),
    prisma.industryRecord.count({ where: { businessId, industryCode: pack.code, archivedAt: null, dueAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400000) } } }),
    prisma.industryRecord.count({ where: { businessId, industryCode: pack.code, archivedAt: null, dueAt: { lt: new Date() }, status: { notIn: ["paid", "completed", "cancelled", "expired", "closed"] } } }),
  ]);
  return plain({ industry: { code: pack.code, name: pack.name }, total, grouped, dueSoon, overdue, widgets: pack.dashboardWidgets });
}

function assertBatchIndustry(pack: IndustryPack) {
  if (!["grocery", "pharmacy"].includes(pack.code)) throw new ApiError(403, "Batch and expiry operations are available only for Grocery and Pharmacy industry packs");
}

export async function listBatches(businessId: string, userId: string | null, query: any) {
  const access = await loadUserAccess(prisma, businessId, userId);
  const { pack } = await selectedPack(prisma, businessId);
  assertBatchIndustry(pack);
  authorize(access, `industry.${pack.code}.batch.view`, true);
  const days = Math.max(0, Math.min(3650, numberValue(query.expiringWithinDays, 0)));
  const now = new Date();
  const rows = await prisma.inventoryBatch.findMany({
    where: {
      businessId,
      ...(cleanString(query.productId) ? { productId: cleanString(query.productId) } : {}),
      ...(cleanString(query.warehouseId) ? { warehouseId: cleanString(query.warehouseId) } : {}),
      ...(cleanString(query.status) ? { status: cleanString(query.status) } : {}),
      ...(days ? { expiryDate: { gte: now, lte: new Date(now.getTime() + days * 86400000) } } : {}),
    },
    include: { product: { select: { id: true, sku: true, name: true } }, warehouse: { select: { id: true, name: true, branchId: true } } },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
    take: queryLimit(query.limit, 100, 500),
  });
  return plain(rows);
}

export async function createBatch(req: Request, businessId: string, userId: string | null, input: any) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId);
    const { pack } = await selectedPack(tx, businessId);
    assertBatchIndustry(pack);
    authorize(access, `industry.${pack.code}.batch.create`, true);
    const productId = requireText(input?.productId, "Product");
    const warehouseId = requireText(input?.warehouseId, "Warehouse");
    const [product, warehouse] = await Promise.all([
      tx.product.findFirst({ where: { id: productId, businessId, active: true, deleted: false } }),
      tx.warehouse.findFirst({ where: { id: warehouseId, businessId, active: true } }),
    ]);
    if (!product || !warehouse) throw new ApiError(400, "Product and warehouse must belong to this business");
    const expiryDate = dateValue(input?.expiryDate);
    if (!expiryDate) throw new ApiError(400, "A valid expiry date is required");
    const status = String(input?.status || "available").toLowerCase();
    if (!["available", "near_expiry", "expired", "quarantined", "recalled", "damaged", "returned", "depleted"].includes(status)) throw new ApiError(400, "Unsupported batch status");
    const row = await tx.inventoryBatch.create({
      data: {
        businessId,
        productId,
        warehouseId,
        batchNo: requireText(input?.batchNo, "Batch / lot number"),
        gtin: cleanString(input?.gtin) || null,
        productionDate: dateValue(input?.productionDate) || null,
        bestBeforeDate: dateValue(input?.bestBeforeDate) || null,
        expiryDate,
        smallestUnit: cleanString(input?.smallestUnit) || "PCS",
        unitsPerStockUnit: Math.max(0.0001, numberValue(input?.unitsPerStockUnit, 1)),
        qtyOnHandBase: Math.max(0, numberValue(input?.qtyOnHandBase)),
        qtyReservedBase: Math.max(0, numberValue(input?.qtyReservedBase)),
        costPerBaseUnit: Math.max(0, numberValue(input?.costPerBaseUnit)),
        status,
        quarantineReason: cleanString(input?.quarantineReason) || null,
        recallReference: cleanString(input?.recallReference) || null,
        metadata: objectValue(input?.metadata) as any,
        createdByUserId: access.userId,
        updatedByUserId: access.userId,
      },
    });
    await writeAudit(tx, req, { businessId, userId: access.userId, action: `industry.${pack.code}.batch.create`, entityType: "InventoryBatch", entityId: row.id, after: { productId, warehouseId, batchNo: row.batchNo, expiryDate: row.expiryDate, status: row.status } });
    return plain(row);
  });
}

export async function updateBatch(req: Request, businessId: string, userId: string | null, id: string, input: any) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId);
    const { pack } = await selectedPack(tx, businessId);
    assertBatchIndustry(pack);
    authorize(access, `industry.${pack.code}.batch.update`, true);
    const current = await tx.inventoryBatch.findFirst({ where: { id, businessId } });
    if (!current) throw new ApiError(404, "Inventory batch not found");
    const revision = Number(input?.revision ?? current.revision);
    if (revision !== current.revision) throw new ApiError(409, "This batch changed on another device; reload before saving");
    const status = String(input?.status || current.status).toLowerCase();
    if (!["available", "near_expiry", "expired", "quarantined", "recalled", "damaged", "returned", "depleted"].includes(status)) throw new ApiError(400, "Unsupported batch status");
    const result = await tx.inventoryBatch.updateMany({
      where: { id, businessId, revision: current.revision },
      data: {
        status,
        qtyOnHandBase: input?.qtyOnHandBase === undefined ? current.qtyOnHandBase : Math.max(0, numberValue(input.qtyOnHandBase)),
        qtyReservedBase: input?.qtyReservedBase === undefined ? current.qtyReservedBase : Math.max(0, numberValue(input.qtyReservedBase)),
        quarantineReason: input?.quarantineReason === undefined ? current.quarantineReason : cleanString(input.quarantineReason) || null,
        recallReference: input?.recallReference === undefined ? current.recallReference : cleanString(input.recallReference) || null,
        metadata: (input?.metadata === undefined ? current.metadata : objectValue(input.metadata)) as any,
        revision: { increment: 1 },
        updatedByUserId: access.userId,
      },
    });
    if (!result.count) throw new ApiError(409, "This batch changed on another device; reload before saving");
    const row = await tx.inventoryBatch.findUniqueOrThrow({ where: { id } });
    await writeAudit(tx, req, { businessId, userId: access.userId, action: `industry.${pack.code}.batch.update`, entityType: "InventoryBatch", entityId: id, before: { status: current.status, revision: current.revision }, after: { status: row.status, revision: row.revision } });
    return plain(row);
  });
}

export async function listPrintProfiles(businessId: string, userId: string | null) {
  const access = await loadUserAccess(prisma, businessId, userId);
  authorize(access, "documents.print", true);
  return plain(await prisma.printProfile.findMany({ where: { businessId, active: true }, orderBy: [{ documentType: "asc" }, { isDefault: "desc" }, { name: "asc" }] }));
}

export async function savePrintProfile(req: Request, businessId: string, userId: string | null, id: string | null, input: any) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId);
    authorize(access, "settings.print_profiles", true);
    const paperSize = String(input?.paperSize || "A4").toUpperCase();
    if (!["A4", "80MM", "58MM"].includes(paperSize)) throw new ApiError(400, "Paper size must be A4, 80MM, or 58MM");
    const data: any = {
      code: requireText(input?.code, "Profile code").toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
      name: requireText(input?.name, "Profile name"),
      documentType: String(input?.documentType || "invoice").toLowerCase(),
      paperSize,
      widthMm: paperSize === "A4" ? 210 : paperSize === "80MM" ? 80 : 58,
      heightMm: paperSize === "A4" ? 297 : null,
      marginTopMm: Math.max(0, numberValue(input?.marginTopMm, paperSize === "A4" ? 8 : 2)),
      marginRightMm: Math.max(0, numberValue(input?.marginRightMm, paperSize === "A4" ? 8 : 2)),
      marginBottomMm: Math.max(0, numberValue(input?.marginBottomMm, paperSize === "A4" ? 8 : 2)),
      marginLeftMm: Math.max(0, numberValue(input?.marginLeftMm, paperSize === "A4" ? 8 : 2)),
      fontScale: Math.min(2, Math.max(0.6, numberValue(input?.fontScale, 1))),
      bilingual: Boolean(input?.bilingual),
      copies: Array.isArray(input?.copies) ? input.copies.map(String).filter(Boolean).slice(0, 5) : ["Original"],
      isDefault: Boolean(input?.isDefault),
      active: input?.active === undefined ? true : Boolean(input.active),
      config: objectValue(input?.config),
      updatedByUserId: access.userId,
    };
    const existing = id ? await tx.printProfile.findFirst({ where: { id, businessId } }) : null;
    if (id && !existing) throw new ApiError(404, "Print profile not found");
    if (data.isDefault) await tx.printProfile.updateMany({ where: { businessId, documentType: data.documentType, isDefault: true }, data: { isDefault: false } });
    const row = existing
      ? await tx.printProfile.update({ where: { id: existing.id }, data })
      : await tx.printProfile.create({ data: { businessId, ...data, createdByUserId: access.userId } });
    await writeAudit(tx, req, { businessId, userId: access.userId, action: existing ? "print_profile.update" : "print_profile.create", entityType: "PrintProfile", entityId: row.id, before: existing || undefined, after: row });
    return plain(row);
  });
}

export async function listNotificationRules(businessId: string, userId: string | null) {
  const access = await loadUserAccess(prisma, businessId, userId);
  authorize(access, "notifications.rules.view", true);
  return plain(await prisma.notificationRule.findMany({ where: { businessId }, orderBy: [{ active: "desc" }, { name: "asc" }] }));
}

export async function saveNotificationRule(req: Request, businessId: string, userId: string | null, id: string | null, input: any) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId);
    authorize(access, "notifications.rules.manage", true);
    const channels: string[] = Array.isArray(input?.channels)
      ? Array.from(
          new Set<string>(
            input.channels
              .map((value: any) => String(value))
              .filter((channel: string) => ["in_app", "email", "sms", "whatsapp"].includes(channel))
          )
        )
      : ["in_app"];
    if (!channels.length) throw new ApiError(400, "At least one supported notification channel is required");
    const data: any = {
      code: requireText(input?.code, "Rule code").toLowerCase().replace(/[^a-z0-9_.-]/g, "-"),
      name: requireText(input?.name, "Rule name"),
      eventType: requireText(input?.eventType, "Event type"),
      channels,
      schedule: input?.schedule ? objectValue(input.schedule) : null,
      conditions: objectValue(input?.conditions),
      template: objectValue(input?.template),
      quietHours: input?.quietHours ? objectValue(input.quietHours) : null,
      active: input?.active === undefined ? true : Boolean(input.active),
      updatedByUserId: access.userId,
    };
    const existing = id ? await tx.notificationRule.findFirst({ where: { id, businessId } }) : null;
    if (id && !existing) throw new ApiError(404, "Notification rule not found");
    const row = existing
      ? await tx.notificationRule.update({ where: { id: existing.id }, data })
      : await tx.notificationRule.create({ data: { businessId, ...data, createdByUserId: access.userId } });
    await writeAudit(tx, req, { businessId, userId: access.userId, action: existing ? "notification_rule.update" : "notification_rule.create", entityType: "NotificationRule", entityId: row.id, before: existing || undefined, after: row });
    return plain(row);
  });
}

export async function evaluateNotificationRules(req: Request, businessId: string, userId: string | null) {
  return prisma.$transaction(async tx => {
    const access = await loadUserAccess(tx, businessId, userId);
    authorize(access, "notifications.rules.run", true);
    const [business, rules] = await Promise.all([
      tx.business.findUnique({ where: { id: businessId }, select: { timezone: true } }),
      tx.notificationRule.findMany({ where: { businessId, active: true }, orderBy: { createdAt: "asc" }, take: 100 }),
    ]);
    const now = new Date();
    const dateKey = now.toLocaleDateString("en-CA", { timeZone: business?.timezone || "Asia/Qatar" });
    let queued = 0;
    for (const rule of rules) {
      const conditions = objectValue(rule.conditions);
      const configuredDays = Array.isArray(conditions.daysBefore) ? conditions.daysBefore.map(Number).filter(Number.isFinite) : [30, 14, 7, 1];
      const maxDays = Math.max(1, ...configuredDays);
      const targets: Array<{ id: string; reference: string; dueAt: Date; displayName: string }> = [];
      if (rule.eventType === "inventory.batch.expiring") {
        const rows = await tx.inventoryBatch.findMany({
          where: { businessId, expiryDate: { gte: now, lte: new Date(now.getTime() + maxDays * 86400000) }, status: { in: ["available", "near_expiry"] } },
          include: { product: { select: { name: true } } },
          take: 500,
        });
        for (const row of rows) if (row.expiryDate) targets.push({ id: row.id, reference: row.batchNo, dueAt: row.expiryDate, displayName: row.product.name });
      } else {
        const rows = await tx.industryRecord.findMany({
          where: { businessId, dueAt: { gte: now, lte: new Date(now.getTime() + maxDays * 86400000) }, archivedAt: null, status: { notIn: ["completed", "cancelled", "paid", "closed", "expired"] } },
          take: 500,
        });
        for (const row of rows) if (row.dueAt) targets.push({ id: row.id, reference: row.referenceNo || row.id, dueAt: row.dueAt, displayName: row.displayName });
      }
      for (const target of targets) {
        const days = Math.ceil((target.dueAt.getTime() - now.getTime()) / 86400000);
        if (!configuredDays.includes(days)) continue;
        for (const channel of rule.channels) {
          const idempotencyKey = `${rule.id}:${target.id}:${channel}:${dateKey}`;
          if (await tx.notificationOutbox.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey } } })) continue;
          const payload = {
            title: String(objectValue(rule.template).title || rule.name),
            message: String(objectValue(rule.template).message || `${target.displayName} (${target.reference}) is due in ${days} day(s)`),
            entityId: target.id,
            entityReference: target.reference,
            dueAt: target.dueAt.toISOString(),
            timezone: business?.timezone || "Asia/Qatar",
          };
          if (channel === "in_app") {
            await tx.notification.create({ data: { businessId, type: rule.eventType, title: payload.title, message: payload.message, entityType: "NotificationRuleTarget", entityId: target.id } });
          }
          await tx.notificationOutbox.create({
            data: {
              businessId,
              ruleId: rule.id,
              channel,
              payload,
              idempotencyKey,
              status: channel === "in_app" ? "delivered" : "pending",
              deliveredAt: channel === "in_app" ? now : null,
              nextAttemptAt: channel === "in_app" ? null : now,
            },
          });
          queued += 1;
        }
      }
    }
    await writeAudit(tx, req, { businessId, userId: access.userId, action: "notification_rules.evaluate", entityType: "NotificationRule", after: { queued, evaluatedRules: rules.length, dateKey } });
    return { evaluatedRules: rules.length, queued, dateKey, externalChannelsRequireConfiguredProviders: true };
  });
}
