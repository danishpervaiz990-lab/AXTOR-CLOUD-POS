import { prisma } from "../db/prisma.js";
import { ApiError, cleanString, roundMoney } from "../utils/http.js";

const GROCERY_REPORT_IDS = new Set([
  "grocery-expiry-risk",
  "grocery-waste-share",
  "grocery-recall-share",
]);

function dateRange(query: any) {
  const valid = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(cleanString(value));
  const fromText = valid(query?.from) ? cleanString(query.from) : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toText = valid(query?.to) ? cleanString(query.to) : new Date().toISOString().slice(0, 10);
  return {
    from: new Date(`${fromText}T00:00:00.000+03:00`),
    to: new Date(`${toText}T23:59:59.999+03:00`),
  };
}

function money(value: unknown) {
  return roundMoney(Number(value || 0));
}

function percentage(value: unknown, total: unknown) {
  const denominator = Number(total || 0);
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.0000001) return 0;
  return roundMoney((Number(value || 0) / denominator) * 100);
}

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

async function requireGrocery(businessId: string) {
  const selection = await prisma.businessIndustry.findUnique({
    where: { businessId },
    include: { industry: { select: { code: true } } },
  });
  if (String(selection?.industry?.code || "").toLowerCase() !== "grocery") {
    throw new ApiError(403, "Grocery report access requires a Grocery tenant");
  }
}

export function isGroceryOperationalReport(reportId: string) {
  return GROCERY_REPORT_IDS.has(reportId);
}

export async function runGroceryOperationalReport(businessId: string, reportId: string, query: any = {}) {
  if (!isGroceryOperationalReport(reportId)) return null;
  await requireGrocery(businessId);
  const { from, to } = dateRange(query);

  if (reportId === "grocery-expiry-risk") {
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        businessId,
        expiryDate: { gte: from, lte: to },
        qtyOnHandBase: { gt: 0 },
      },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
    });
    const productIds = [...new Set(batches.map(row => row.productId))];
    const products = productIds.length
      ? await prisma.product.findMany({ where: { businessId, id: { in: productIds } }, select: { id: true, sku: true, name: true } })
      : [];
    const productMap = new Map(products.map(row => [row.id, row]));
    const totalQty = batches.reduce((sum, row) => sum + Number(row.qtyOnHandBase || 0), 0);
    const today = new Date();
    const rows = batches.map(batch => {
      const product = productMap.get(batch.productId);
      const qty = Number(batch.qtyOnHandBase || 0);
      const costImpact = money(qty * Number(batch.costPerBaseUnit || 0));
      const expiry = batch.expiryDate as Date;
      return {
        product: product?.name || "Unknown",
        sku: product?.sku || "-",
        batchNo: batch.batchNo,
        expiryDate: expiry,
        daysToExpiry: Math.ceil((expiry.getTime() - today.getTime()) / 86400000),
        status: batch.status,
        quantity: Number(qty.toFixed(3)),
        costImpact,
        quantitySharePct: percentage(qty, totalQty),
      };
    });
    return {
      title: "Grocery Expiry Risk Report",
      columns: [
        { key: "product", label: "Product" }, { key: "sku", label: "SKU" },
        { key: "batchNo", label: "Batch" }, { key: "expiryDate", label: "Expiry Date" },
        { key: "daysToExpiry", label: "Days to Expiry" }, { key: "status", label: "Status" },
        { key: "quantity", label: "Quantity" }, { key: "costImpact", label: "Cost Value" },
        { key: "quantitySharePct", label: "Quantity Share %" },
      ],
      rows,
      summary: [
        { label: "Batches", value: rows.length },
        { label: "Quantity", value: Number(totalQty.toFixed(3)) },
        { label: "Stock Value", value: money(rows.reduce((sum, row) => sum + row.costImpact, 0)) },
      ],
    };
  }

  if (reportId === "grocery-waste-share") {
    const movements = await prisma.stockMovement.findMany({
      where: {
        businessId,
        movementType: "GROCERY_WASTE",
        createdAt: { gte: from, lte: to },
      },
      orderBy: { createdAt: "desc" },
    });
    const totalQty = movements.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const rows = movements.map(row => {
      const metadata = jsonObject(row.metadata);
      const qty = Number(row.qty || 0);
      return {
        date: row.createdAt,
        wasteNo: row.referenceNo || row.movementNo,
        product: row.productName,
        sku: row.sku || "-",
        batchNo: metadata.batchNo || "-",
        reason: metadata.reason || "Unspecified",
        quantity: Number(qty.toFixed(3)),
        costImpact: money(metadata.costImpact),
        wasteSharePct: percentage(qty, totalQty),
      };
    });
    return {
      title: "Grocery Waste & Spoilage Report",
      columns: [
        { key: "date", label: "Date" }, { key: "wasteNo", label: "Waste No" },
        { key: "product", label: "Product" }, { key: "sku", label: "SKU" },
        { key: "batchNo", label: "Batch" }, { key: "reason", label: "Reason" },
        { key: "quantity", label: "Quantity" }, { key: "costImpact", label: "Cost Impact" },
        { key: "wasteSharePct", label: "Waste Share %" },
      ],
      rows,
      summary: [
        { label: "Waste Records", value: rows.length },
        { label: "Waste Quantity", value: Number(totalQty.toFixed(3)) },
        { label: "Waste Cost", value: money(rows.reduce((sum, row) => sum + row.costImpact, 0)) },
      ],
    };
  }

  const recalls = await prisma.industryRecord.findMany({
    where: {
      businessId,
      industryCode: "grocery",
      entityType: "grocery_recall",
      archivedAt: null,
      createdAt: { gte: from, lte: to },
    },
    orderBy: { createdAt: "desc" },
  });
  const rows = recalls.map(row => {
    const data = jsonObject(row.data);
    return {
      date: row.createdAt,
      reference: row.referenceNo || row.id,
      product: data.product || data.productName || row.displayName,
      batchNo: data.batchNo || data.batch || "-",
      reason: data.reason || data.recallReason || "Unspecified",
      status: row.status,
      quantity: Number(Number(data.quantity || 0).toFixed(3)),
      recordSharePct: percentage(1, recalls.length),
    };
  });
  return {
    title: "Grocery Recall Register",
    columns: [
      { key: "date", label: "Date" }, { key: "reference", label: "Reference" },
      { key: "product", label: "Product" }, { key: "batchNo", label: "Batch" },
      { key: "reason", label: "Reason" }, { key: "status", label: "Status" },
      { key: "quantity", label: "Quantity" }, { key: "recordSharePct", label: "Record Share %" },
    ],
    rows,
    summary: [
      { label: "Recall Records", value: rows.length },
      { label: "Open Recalls", value: rows.filter(row => !["closed", "completed", "cancelled"].includes(String(row.status).toLowerCase())).length },
      { label: "Quantity", value: Number(rows.reduce((sum, row) => sum + row.quantity, 0).toFixed(3)) },
    ],
  };
}
