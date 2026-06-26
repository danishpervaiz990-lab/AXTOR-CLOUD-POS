import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";

type ReturnItemInput = {
  productId?: string | null;
  productName?: string;
  name?: string;
  sku?: string | null;
  barcode?: string | null;
  qrCode?: string | null;
  unit?: string | null;
  soldQty?: number;
  quantity?: number;
  returnQty?: number;
  qty?: number;
  rate?: number;
  unitPrice?: number;
  lineTotal?: number;
  total?: number;
};

function getBusinessId(req: Request) {
  return req.tenant?.businessId ?? undefined;
}

function getUserId(req: Request) {
  return req.tenant?.userId ?? undefined;
}

function cleanString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQty(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function returnTrackingStatus(invoiceTotal: number, returnedAmount: number) {
  if (returnedAmount <= 0) return "not_returned";
  if (returnedAmount >= invoiceTotal) return "fully_returned";
  return "partially_returned";
}

function returnLineKey(value: unknown) {
  const text = cleanString(value);
  return text ? text.toLowerCase() : "";
}

function addReturnedQty(map: Map<string, number>, key: string, qty: number) {
  if (!key) return;
  map.set(key, roundQty((map.get(key) || 0) + qty));
}

function getReturnedQty(map: Map<string, number>, sourceLine: any) {
  const keys = [
    returnLineKey(sourceLine?.id),
    returnLineKey(sourceLine?.productId),
    returnLineKey(sourceLine?.sku),
  ].filter(Boolean);

  let max = 0;
  for (const key of keys) {
    max = Math.max(max, map.get(key) || 0);
  }
  return max;
}

function toDate(value: unknown): Date {
  const text = cleanString(value);
  if (!text) return new Date();
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function getNextReturnNumber(tx: any, businessId: string) {
  const latest = await tx.salesReturn.findFirst({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    select: { returnNo: true },
  });

  const lastNo = String(latest?.returnNo || "");
  const match = lastNo.match(/RET-(\d+)/i);
  const next = match ? Number(match[1]) + 1 : 1;

  return "RET-" + String(next).padStart(6, "0");
}

function formatReturnItem(item: any) {
  return {
    id: item.id,
    businessId: item.businessId,
    salesReturnId: item.salesReturnId,
    productId: item.productId,
    sku: item.sku,
    barcode: item.barcode,
    qrCode: item.qrCode,
    name: item.name,
    productName: item.name,
    unit: item.unit,
    soldQty: Number(item.soldQty || 0),
    returnQty: Number(item.returnQty || 0),
    qty: Number(item.returnQty || 0),
    rate: Number(item.rate || 0),
    unitPrice: Number(item.rate || 0),
    total: Number(item.total || 0),
    lineTotal: Number(item.total || 0),
    createdAt: item.createdAt,
  };
}

function formatSalesReturn(row: any) {
  const items = Array.isArray(row.items) ? row.items.map(formatReturnItem) : [];

  return {
    id: row.id,
    businessId: row.businessId,
    branchId: row.branchId,
    returnNo: row.returnNo,
    documentNo: row.returnNo,
    sourceSalesDocumentId: row.sourceSalesDocumentId,
    salesDocumentId: row.sourceSalesDocumentId,
    sourceDocumentNo: row.sourceDocumentNo,
    customerId: row.customerId,
    customerName: row.customerName,
    reason: row.reason,
    status: String(row.status || "posted").toLowerCase(),
    statusRaw: row.status,
    subtotal: Number(row.subtotal || 0),
    total: Number(row.total || 0),
    totalAmount: Number(row.total || 0),
    grandTotal: Number(row.total || 0),
    refundAmount: Number(row.refundAmount || 0),
    creditAmount: Number(row.creditAmount || 0),
    returnDate: row.returnDate,
    date: row.returnDate,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items,
    lines: items,
  };
}

export async function listSalesReturns(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(401).json({
        ok: false,
        error: { message: "Unauthorized: business context missing" },
      });
    }

    const where: any = { businessId };

    const sourceSalesDocumentId = cleanString(req.query.sourceSalesDocumentId);
    if (sourceSalesDocumentId) where.sourceSalesDocumentId = sourceSalesDocumentId;

    const customerId = cleanString(req.query.customerId);
    if (customerId) where.customerId = customerId;

    const rows = await (prisma as any).salesReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { items: true },
      take: 100,
    });

    return res.json({
      ok: true,
      count: rows.length,
      data: rows.map(formatSalesReturn),
    });
  } catch (error) {
    console.error("listSalesReturns error:", error);

    return res.status(500).json({
      ok: false,
      error: { message: "Failed to list sales returns" },
    });
  }
}

export async function getSalesReturnById(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);
    const id = cleanString(req.params.id);

    if (!businessId) {
      return res.status(401).json({
        ok: false,
        error: { message: "Unauthorized: business context missing" },
      });
    }

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: { message: "Sales return id is required" },
      });
    }

    const row = await (prisma as any).salesReturn.findFirst({
      where: { id, businessId },
      include: { items: true },
    });

    if (!row) {
      return res.status(404).json({
        ok: false,
        error: { message: "Sales return not found" },
      });
    }

    return res.json({
      ok: true,
      data: formatSalesReturn(row),
    });
  } catch (error) {
    console.error("getSalesReturnById error:", error);

    return res.status(500).json({
      ok: false,
      error: { message: "Failed to get sales return" },
    });
  }
}

export async function createSalesReturn(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);

    if (!businessId) {
      return res.status(401).json({
        ok: false,
        error: { message: "Unauthorized: business context missing" },
      });
    }

    const sourceSalesDocumentId =
      cleanString(req.body?.sourceSalesDocumentId) ||
      cleanString(req.body?.salesDocumentId) ||
      cleanString(req.body?.invoiceId);

    if (!sourceSalesDocumentId) {
      return res.status(400).json({
        ok: false,
        error: { message: "sourceSalesDocumentId is required" },
      });
    }

    const inputItems = Array.isArray(req.body?.items)
      ? (req.body.items as ReturnItemInput[])
      : [];

    if (!inputItems.length) {
      return res.status(400).json({
        ok: false,
        error: { message: "At least one return item is required" },
      });
    }

    const result = await (prisma as any).$transaction(async (tx: any) => {
      const sourceDoc = await tx.salesDocument.findFirst({
        where: {
          id: sourceSalesDocumentId,
          businessId,
          documentType: "INVOICE",
        },
        include: {
          items: true,
          returns: {
            include: { items: true },
          },
        },
      });

      if (!sourceDoc) {
        throw new Error("Source invoice not found");
      }

      const sourceLines = new Map<string, any>();
      for (const line of sourceDoc.items || []) {
        if (line.productId) sourceLines.set(String(line.productId), line);
        sourceLines.set(String(line.id), line);
        if (line.sku) sourceLines.set(String(line.sku).toLowerCase(), line);
      }

      const alreadyReturnedQty = new Map<string, number>();
      const existingReturns = Array.isArray(sourceDoc.returns) ? sourceDoc.returns : [];

      for (const previousReturn of existingReturns) {
        if (String(previousReturn.status || "").toLowerCase() === "cancelled") continue;

        for (const previousItem of previousReturn.items || []) {
          const qty = roundQty(toNumber(previousItem.returnQty, 0));
          addReturnedQty(alreadyReturnedQty, returnLineKey(previousItem.productId), qty);
          addReturnedQty(alreadyReturnedQty, returnLineKey(previousItem.sku), qty);
        }
      }

      const preparedItems = inputItems
        .map((item, index) => {
          const productId = cleanString(item.productId);
          const sku = cleanString(item.sku);
          const key = productId || sku?.toLowerCase() || `line-${index}`;
          const sourceLine = key ? sourceLines.get(key) : null;

          const soldQty = roundQty(toNumber(item.soldQty ?? item.quantity ?? sourceLine?.qty, 0));
          const returnQty = roundQty(toNumber(item.returnQty ?? item.qty, 0));

          if (returnQty <= 0) return null;

          const alreadyReturned = sourceLine ? getReturnedQty(alreadyReturnedQty, sourceLine) : 0;
          const remainingReturnable = roundQty(Math.max(0, soldQty - alreadyReturned));

          if (soldQty > 0 && returnQty > remainingReturnable) {
            throw new Error(
              `Return qty cannot exceed remaining returnable qty for ${sourceLine?.name || item.productName || item.name || sku || productId}. Sold: ${soldQty}, Already returned: ${alreadyReturned}, Remaining: ${remainingReturnable}`
            );
          }

          const rate = roundMoney(toNumber(item.rate ?? item.unitPrice ?? sourceLine?.rate, 0));
          const total = roundMoney(toNumber(item.lineTotal ?? item.total, returnQty * rate));

          return {
            productId: productId || sourceLine?.productId || null,
            sku: sku || sourceLine?.sku || null,
            barcode: cleanString(item.barcode) || sourceLine?.barcode || null,
            qrCode: cleanString(item.qrCode) || sourceLine?.qrCode || null,
            name:
              cleanString(item.productName) ||
              cleanString(item.name) ||
              sourceLine?.name ||
              "Returned Item",
            unit: cleanString(item.unit) || sourceLine?.unit || "PCS",
            soldQty,
            returnQty,
            rate,
            alreadyReturned,
            remainingReturnable,
            total,
          };
        })
        .filter(Boolean) as Array<{
          productId: string | null;
          sku: string | null;
          barcode: string | null;
          qrCode: string | null;
          name: string;
          unit: string;
          soldQty: number;
          returnQty: number;
          rate: number;
          alreadyReturned: number;
          remainingReturnable: number;
          total: number;
        }>;

      if (!preparedItems.length) {
        throw new Error("Return quantity is required for at least one item");
      }

      const subtotal = roundMoney(
        preparedItems.reduce((sum, item) => sum + item.total, 0)
      );
      const total = subtotal;
      const returnNo = await getNextReturnNumber(tx, businessId);
      const returnDate = toDate(req.body?.returnDate ?? req.body?.date);
      const reason = cleanString(req.body?.reason) ?? "Sales return";

      const salesReturn = await tx.salesReturn.create({
        data: {
          businessId,
          branchId: sourceDoc.branchId ?? null,
          returnNo,
          sourceSalesDocumentId: sourceDoc.id,
          sourceDocumentNo: sourceDoc.documentNo,
          customerId: sourceDoc.customerId ?? null,
          customerName: sourceDoc.customerName || "Walk-in Customer",
          reason,
          status: "POSTED",
          subtotal,
          total,
          refundAmount: 0,
          creditAmount: total,
          returnDate,
          metadata: {
            createdById: userId ?? null,
            source: "api",
            frontendPayload: {
              notes: cleanString(req.body?.notes) ?? null,
            },
          },
          items: {
            create: preparedItems.map((item) => ({
              businessId,
              productId: item.productId,
              sku: item.sku,
              barcode: item.barcode,
              qrCode: item.qrCode,
              name: item.name,
              unit: item.unit,
              soldQty: item.soldQty,
              returnQty: item.returnQty,
              rate: item.rate,
              total: item.total,
            })),
          },
        },
        include: { items: true },
      });

      for (let index = 0; index < preparedItems.length; index += 1) {
        const item = preparedItems[index];

        if (!item.productId) continue;

        const product = await tx.product.findFirst({
          where: { id: item.productId, businessId, deleted: false },
        });

        if (!product) continue;

        const beforeQty = Number(product.currentStock || 0);
        const afterQty = roundQty(beforeQty + item.returnQty);

        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: {
              increment: item.returnQty,
            },
          },
        });

        await tx.stockMovement.create({
          data: {
            businessId,
            movementNo: `${returnNo}-${String(index + 1).padStart(3, "0")}`,
            productId: item.productId,
            sku: item.sku,
            productName: item.name,
            warehouseId: cleanString(req.body?.warehouseId) ?? null,
            direction: "IN",
            movementType: "sales_return",
            referenceNo: returnNo,
            qty: item.returnQty,
            beforeQty,
            afterQty,
            source: "sales_return",
            metadata: {
              salesReturnId: salesReturn.id,
              sourceSalesDocumentId: sourceDoc.id,
              sourceDocumentNo: sourceDoc.documentNo,
              createdById: userId ?? null,
            },
          },
        });
      }

      const previousReturnedAmount = roundMoney(toNumber(sourceDoc.returnedAmount, 0));
      const nextReturnedAmount = roundMoney(previousReturnedAmount + total);
      const nextReturnCount = Number(sourceDoc.returnCount || 0) + 1;
      const sourceTotal = roundMoney(toNumber(sourceDoc.total, 0));
      const nextReturnStatus = returnTrackingStatus(sourceTotal, nextReturnedAmount);

      await tx.salesDocument.update({
        where: { id: sourceDoc.id },
        data: {
          returnStatus: nextReturnStatus,
          returnedAmount: nextReturnedAmount,
          returnCount: nextReturnCount,
          metadata: {
            ...(sourceDoc.metadata && typeof sourceDoc.metadata === "object" ? sourceDoc.metadata : {}),
            lastReturnNo: returnNo,
            lastReturnId: salesReturn.id,
            lastReturnedAmount: total,
            lastReturnedAt: new Date().toISOString(),
          },
        },
      });

      return salesReturn;
    });

    return res.status(201).json({
      ok: true,
      message: "Sales return posted successfully",
      data: formatSalesReturn(result),
    });
  } catch (error: any) {
    console.error("createSalesReturn error:", error);

    return res.status(400).json({
      ok: false,
      error: { message: error?.message || "Failed to create sales return" },
    });
  }
}
