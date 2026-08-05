import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { ApiError, handleError, tenant } from "../utils/http.js";
import { writeAudit } from "../services/audit.service.js";

const router = Router();
router.use(requireAuth);

const text = (value: unknown) => String(value ?? "").trim();
const allowedTypes = new Map([
  ["categories", "grocery_category"],
  ["loyalty", "grocery_loyalty"],
  ["promotions", "grocery_promotion"],
]);

async function requireGrocery(businessId: string) {
  const selected = await prisma.businessIndustry.findUnique({ where: { businessId }, include: { industry: { select: { code: true } } } });
  if (String(selected?.industry?.code || "").toLowerCase() !== "grocery") throw new ApiError(403, "Grocery industry access required");
}

function entityType(req: Request) {
  const type = allowedTypes.get(String(req.params.kind || "").toLowerCase());
  if (!type) throw new ApiError(404, "Unsupported Grocery master-data module");
  return type;
}

router.get("/:kind", async (req: Request, res: Response) => {
  try {
    const t = tenant(req); await requireGrocery(t.businessId); const type = entityType(req);
    const rows = await prisma.industryRecord.findMany({
      where: { businessId: t.businessId, industryCode: "grocery", entityType: type, archivedAt: null },
      orderBy: { createdAt: "desc" }, take: Math.min(500, Math.max(1, Number(req.query.limit) || 200)),
    });
    res.json({ ok: true, data: rows });
  } catch (error) { handleError(res, error); }
});

router.post("/:kind", async (req: Request, res: Response) => {
  try {
    const t = tenant(req); await requireGrocery(t.businessId); const type = entityType(req);
    const input = req.body || {}; const data = input.data && typeof input.data === "object" ? input.data : input;
    const name = text(data.name || data.customerReference || data.code || input.displayName);
    if (!name) throw new ApiError(400, "Name or reference is required");
    const row = await prisma.industryRecord.create({ data: {
      businessId: t.businessId, industryCode: "grocery", entityType: type,
      displayName: name, status: text(input.status || data.status || "active").toLowerCase(),
      data, createdByUserId: t.userId, updatedByUserId: t.userId,
    } });
    const prefix = type === "grocery_category" ? "CAT" : type === "grocery_loyalty" ? "LOY" : "PRO";
    const updated = await prisma.industryRecord.update({ where: { id: row.id }, data: { referenceNo: `${prefix}-${row.id.slice(-8).toUpperCase()}` } });
    await writeAudit(prisma, req, { businessId: t.businessId, userId: t.userId, action: `${type}.create`, entityType: "IndustryRecord", entityId: row.id, after: { status: updated.status, displayName: updated.displayName } });
    res.status(201).json({ ok: true, data: updated });
  } catch (error) { handleError(res, error); }
});

router.patch("/:kind/:id", async (req: Request, res: Response) => {
  try {
    const t = tenant(req); await requireGrocery(t.businessId); const type = entityType(req);
    const current = await prisma.industryRecord.findFirst({ where: { id: req.params.id, businessId: t.businessId, industryCode: "grocery", entityType: type, archivedAt: null } });
    if (!current) throw new ApiError(404, "Grocery record not found");
    const input = req.body || {}; const nextData = input.data && typeof input.data === "object" ? input.data : { ...(current.data as any || {}), ...input };
    const name = text(nextData.name || nextData.customerReference || nextData.code || input.displayName || current.displayName);
    const updated = await prisma.industryRecord.update({ where: { id: current.id }, data: {
      displayName: name || current.displayName,
      status: text(input.status || nextData.status || current.status).toLowerCase(),
      data: nextData, revision: { increment: 1 }, updatedByUserId: t.userId,
    } });
    await writeAudit(prisma, req, { businessId: t.businessId, userId: t.userId, action: `${type}.update`, entityType: "IndustryRecord", entityId: current.id, before: { status: current.status }, after: { status: updated.status } });
    res.json({ ok: true, data: updated });
  } catch (error) { handleError(res, error); }
});

router.delete("/:kind/:id", async (req: Request, res: Response) => {
  try {
    const t = tenant(req); await requireGrocery(t.businessId); const type = entityType(req);
    const current = await prisma.industryRecord.findFirst({ where: { id: req.params.id, businessId: t.businessId, industryCode: "grocery", entityType: type, archivedAt: null } });
    if (!current) throw new ApiError(404, "Grocery record not found");
    const updated = await prisma.industryRecord.update({ where: { id: current.id }, data: { archivedAt: new Date(), status: "archived", revision: { increment: 1 }, updatedByUserId: t.userId } });
    res.json({ ok: true, data: updated });
  } catch (error) { handleError(res, error); }
});

export default router;
