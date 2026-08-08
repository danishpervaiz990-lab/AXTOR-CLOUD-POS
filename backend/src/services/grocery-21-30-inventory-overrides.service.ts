import { prisma } from "../db/prisma.js";
import { roundMoney } from "../utils/http.js";

const db: any = prisma;
const IDS = new Set(["grocery-inventory-transfer", "grocery-inventory-count-variance"]);
const text = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (v: unknown) => roundMoney(num(v));
const qty = (v: unknown) => Number(num(v).toFixed(3));
const pct = (v: unknown, total: unknown) => Math.abs(num(total)) < 0.0000001 ? 0 : roundMoney(num(v) / num(total) * 100);
const json = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};

function range(q: any) {
  const now = new Date();
  const valid = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(text(v));
  const from = valid(q.from) ? new Date(`${text(q.from)}T00:00:00.000+03:00`) : new Date(now.getTime() - 30 * 86400000);
  const to = valid(q.to) ? new Date(`${text(q.to)}T23:59:59.999+03:00`) : now;
  return { from, to };
}
function finalize(title: string, columns: any[], sourceRows: any[], summary: any[], q: any) {
  let rows = [...sourceRows];
  const search = text(q.search).toLowerCase();
  if (search) rows = rows.filter(row => Object.values(row).some(v => String(v ?? "").toLowerCase().includes(search)));
  const sortBy = text(q.sortBy); const asc = text(q.sortDir).toLowerCase() === "asc";
  if (sortBy) rows.sort((a, b) => { const av = a[sortBy], bv = b[sortBy]; const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? "")); return asc ? cmp : -cmp; });
  const totalRows = rows.length, page = Math.max(1, Math.trunc(num(q.page) || 1)), pageSize = Math.max(10, Math.min(500, Math.trunc(num(q.pageSize) || 100)));
  return { title, columns, rows: rows.slice((page - 1) * pageSize, page * pageSize), summary, meta: { page, pageSize, totalRows, sortBy: sortBy || null, sortDir: asc ? "asc" : "desc", search: search || null }, exports: ["csv", "xlsx", "pdf", "print"] };
}

export function isGrocery21To30InventoryOverrideReport(id: string) { return IDS.has(id); }

export async function runGrocery21To30InventoryOverrideReport(businessId: string, id: string, q: any = {}) {
  if (!IDS.has(id)) return null;
  const { from, to } = range(q);
  if (id === "grocery-inventory-transfer") {
    const [records, warehouses, vans] = await Promise.all([
      db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_stock_transfer", archivedAt: null, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "desc" }, take: 20000 }),
      db.warehouse.findMany({ where: { businessId }, select: { id: true, name: true } }),
      db.industryRecord.findMany({ where: { businessId, industryCode: "grocery", entityType: "grocery_van", archivedAt: null }, select: { id: true, displayName: true } }),
    ]);
    const wh = new Map<string, string>(warehouses.map((x: any): [string, string] => [String(x.id), String(x.name)]));
    const van = new Map<string, string>(vans.map((x: any): [string, string] => [String(x.id), String(x.displayName)]));
    const label = (kind: string, value: string) => kind === "warehouse" ? (wh.get(value) || value) : (van.get(value) || value);
    const rows = records.map((record: any) => {
      const d = json(record.data); const lines = Array.isArray(d.lines) ? d.lines : [];
      const requestedQty = lines.reduce((s: number, x: any) => s + num(x.qty), 0);
      const receivedQty = lines.reduce((s: number, x: any) => s + num(x.receivedQty), 0);
      return { date: record.createdAt, transferNo: record.referenceNo || record.id, status: record.status, source: label(text(d.sourceType), text(d.sourceId)), destination: label(text(d.destinationType), text(d.destinationId)), lineCount: lines.length, requestedQty: qty(requestedQty), receivedQty: qty(receivedQty), receivedPct: pct(receivedQty, requestedQty), outstandingQty: qty(Math.max(0, requestedQty - receivedQty)) };
    });
    return finalize("Stock Transfer", [
      { key: "date", label: "Date" }, { key: "transferNo", label: "Transfer" }, { key: "status", label: "Status" }, { key: "source", label: "Source" }, { key: "destination", label: "Destination" }, { key: "lineCount", label: "Lines" }, { key: "requestedQty", label: "Requested Qty" }, { key: "receivedQty", label: "Received Qty" }, { key: "receivedPct", label: "Received %" }, { key: "outstandingQty", label: "Outstanding Qty" },
    ], rows, [{ label: "Transfers", value: rows.length }, { label: "Requested Qty", value: qty(rows.reduce((s: number, x: any) => s + x.requestedQty, 0)) }, { label: "Received Qty", value: qty(rows.reduce((s: number, x: any) => s + x.receivedQty, 0)) }], q);
  }

  const where: any = { businessId, createdAt: { gte: from, lte: to } };
  if (text(q.warehouseId)) where.warehouseId = text(q.warehouseId);
  const counts = await db.stockCount.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" }, take: 5000 });
  const productIds = [...new Set<string>(counts.flatMap((c: any) => (c.items || []).map((i: any) => text(i.productId)).filter(Boolean)))];
  const [products, warehouses] = await Promise.all([
    productIds.length ? db.product.findMany({ where: { businessId, id: { in: productIds } }, select: { id: true, costPrice: true } }) : [],
    db.warehouse.findMany({ where: { businessId }, select: { id: true, name: true } }),
  ]);
  const costs = new Map<string, number>(products.map((x: any): [string, number] => [String(x.id), num(x.costPrice)]));
  const wh = new Map<string, string>(warehouses.map((x: any): [string, string] => [String(x.id), String(x.name)]));
  const rows = counts.flatMap((count: any) => (count.items || []).map((item: any) => {
    const systemQty = num(item.systemQty), countedQty = num(item.countedQty), difference = num(item.difference ?? countedQty - systemQty), unitCost = costs.get(String(item.productId)) || 0;
    return { date: count.createdAt, countNo: count.countNo, status: count.status, warehouse: wh.get(String(count.warehouseId)) || count.warehouseId, sku: item.sku, product: item.productName, systemQty: qty(systemQty), physicalQty: qty(countedQty), varianceQty: qty(difference), variancePct: pct(difference, Math.abs(systemQty)), unitCost: money(unitCost), varianceValue: money(difference * unitCost) };
  }));
  const absoluteValue = rows.reduce((s: number, x: any) => s + Math.abs(x.varianceValue), 0);
  const enriched = rows.map((x: any) => ({ ...x, varianceValuePct: pct(Math.abs(x.varianceValue), absoluteValue) }));
  return finalize("Inventory Count Variance", [
    { key: "date", label: "Date" }, { key: "countNo", label: "Count" }, { key: "status", label: "Status" }, { key: "warehouse", label: "Warehouse" }, { key: "sku", label: "SKU" }, { key: "product", label: "Product" }, { key: "systemQty", label: "System Qty" }, { key: "physicalQty", label: "Physical Qty" }, { key: "varianceQty", label: "Variance Qty" }, { key: "variancePct", label: "Variance %" }, { key: "unitCost", label: "Unit Cost" }, { key: "varianceValue", label: "Variance Value" }, { key: "varianceValuePct", label: "% of Absolute Variance Value" },
  ], enriched, [{ label: "Count Lines", value: enriched.length }, { label: "Net Variance Value", value: money(enriched.reduce((s: number, x: any) => s + x.varianceValue, 0)) }, { label: "Absolute Variance Value", value: money(absoluteValue) }], q);
}
