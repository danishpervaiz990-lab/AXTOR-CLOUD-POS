import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import {
  getDocumentPrefix,
  getNextDocumentNumber,
} from "../utils/document-number.js";

type PrismaDocumentType = "INVOICE" | "QUOTATION" | "DELIVERY_NOTE";
type ApiDocumentType = "invoice" | "quotation" | "delivery_note";

type CreateSalesDocumentItemInput = {
  productId?: string;
  sku?: string;
  barcode?: string;
  qrCode?: string;
  name?: string;
  description?: string;
  unit?: string;
  qty?: number;
  rate?: number;
  price?: number;
  unitPrice?: number;
  discount?: number;
  discountAmount?: number;
  taxRate?: number;
};

const documentTypeMap: Record<string, PrismaDocumentType> = {
  invoice: "INVOICE",
  INVOICE: "INVOICE",
  quotation: "QUOTATION",
  QUOTATION: "QUOTATION",
  quote: "QUOTATION",
  delivery_note: "DELIVERY_NOTE",
  DELIVERY_NOTE: "DELIVERY_NOTE",
  dn: "DELIVERY_NOTE",
  DN: "DELIVERY_NOTE",
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

function toNumber(value: unknown, defaultValue = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function normalizeDocumentType(value: unknown): PrismaDocumentType | null {
  const text = cleanString(value);

  if (!text) return null;

  return documentTypeMap[text] ?? documentTypeMap[text.toLowerCase()] ?? null;
}

function toApiDocumentType(documentType: PrismaDocumentType): ApiDocumentType {
  if (documentType === "INVOICE") return "invoice";
  if (documentType === "QUOTATION") return "quotation";
  return "delivery_note";
}

function normalizeStatus(value: unknown) {
  const text = cleanString(value);

  if (!text) return undefined;

  const status = text.toUpperCase();
  const allowed = [
    "DRAFT",
    "ISSUED",
    "PAID",
    "PARTIALLY_PAID",
    "CREDIT",
    "CANCELLED",
    "VOID",
  ];

  return allowed.includes(status) ? status : undefined;
}

function toDate(value: unknown): Date | undefined {
  const text = cleanString(value);

  if (!text) return undefined;

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return undefined;

  return date;
}

function getPaymentStatus(total: number, paid: number) {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

function formatItem(item: any) {
  return {
    id: item.id,
    businessId: item.businessId,
    salesDocumentId: item.salesDocumentId,
    productId: item.productId,
    sku: item.sku,
    barcode: item.barcode,
    qrCode: item.qrCode,
    name: item.name,
    description: item.description,
    unit: item.unit,
    qty: Number(item.qty),
    quantity: Number(item.qty),
    rate: Number(item.rate),
    unitPrice: Number(item.rate),
    price: Number(item.price),
    discount: Number(item.discount),
    taxRate: Number(item.taxRate),
    tax: Number(item.tax),
    total: Number(item.total),
    lineTotal: Number(item.total),
    createdAt: item.createdAt,
  };
}

function formatSalesDocument(document: any) {
  const documentType = String(document.documentType) as PrismaDocumentType;

  const total = Number(document.total || 0);
  const paid = Number(document.paid || 0);
  const balance = Number(document.balance || 0);

  return {
    id: document.id,
    businessId: document.businessId,
    branchId: document.branchId,
    documentNo: document.documentNo,
    documentType: toApiDocumentType(documentType),
    documentTypeRaw: document.documentType,
    documentPrefix: document.documentPrefix,
    lpoNo: document.lpoNo,
    customerPoNo: document.customerPoNo,
    poNo: document.poNo,
    customerId: document.customerId,
    customerName: document.customerName,
    salesmanId: document.salesmanId,
    salesmanName: document.salesmanName,
    paymentMethod: document.paymentMethod,
    paymentStatus: document.paymentStatus,
    stockStatus: document.stockStatus,
    status: String(document.status).toLowerCase(),
    statusRaw: document.status,
    subtotal: Number(document.subtotal),
    discount: Number(document.discount),
    tax: Number(document.tax),

    total,
    amount: total,
    totalAmount: total,
    grandTotal: total,
    netAmount: total,

    paid,
    paidAmount: paid,
    amountPaid: paid,
    receivedAmount: paid,

    balance,
    balanceAmount: balance,
    creditAmount: Number(document.creditAmount),

    customerCreditApplied: document.customerCreditApplied,
    dueDate: document.dueDate,
    issuedAt: document.issuedAt,
    documentDate: document.issuedAt,
    date: document.issuedAt,
    metadata: document.metadata,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    items: Array.isArray(document.items) ? document.items.map(formatItem) : [],
    lines: Array.isArray(document.items) ? document.items.map(formatItem) : [],
  };
}

export async function listSalesDocuments(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(401).json({
        ok: false,
        error: { message: "Unauthorized: business context missing" },
      });
    }

    const where: any = { businessId };

    const documentType = normalizeDocumentType(req.query.documentType);
    if (documentType) where.documentType = documentType;

    const customerId = cleanString(req.query.customerId);
    if (customerId) where.customerId = customerId;

    const status = normalizeStatus(req.query.status);
    if (status) where.status = status;

    const documents = await (prisma as any).salesDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { items: true },
      take: 100,
    });

    return res.json({
      ok: true,
      count: documents.length,
      data: documents.map(formatSalesDocument),
    });
  } catch (error) {
    console.error("listSalesDocuments error:", error);

    return res.status(500).json({
      ok: false,
      error: { message: "Failed to list sales documents" },
    });
  }
}

export async function getSalesDocumentById(req: Request, res: Response) {
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
        error: { message: "Sales document id is required" },
      });
    }

    const document = await (prisma as any).salesDocument.findFirst({
      where: { id, businessId },
      include: { items: true },
    });

    if (!document) {
      return res.status(404).json({
        ok: false,
        error: { message: "Sales document not found" },
      });
    }

    return res.json({
      ok: true,
      data: formatSalesDocument(document),
    });
  } catch (error) {
    console.error("getSalesDocumentById error:", error);

    return res.status(500).json({
      ok: false,
      error: { message: "Failed to get sales document" },
    });
  }
}

export async function createSalesDocument(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);
    const userId = getUserId(req);

    if (!businessId) {
      return res.status(401).json({
        ok: false,
        error: { message: "Unauthorized: business context missing" },
      });
    }

    const documentType = normalizeDocumentType(req.body?.documentType);

    if (!documentType) {
      return res.status(400).json({
        ok: false,
        error: {
          message: "Invalid documentType. Use invoice, quotation, or delivery_note",
        },
      });
    }

    const items = Array.isArray(req.body?.items)
      ? (req.body.items as CreateSalesDocumentItemInput[])
      : [];

    if (items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: { message: "At least one item is required" },
      });
    }

    const branchId = cleanString(req.body?.branchId);
    const warehouseId = cleanString(req.body?.warehouseId);
    const customerId = cleanString(req.body?.customerId);

    let customerName =
      cleanString(req.body?.customerName) ||
      cleanString(req.body?.customerNameSnapshot) ||
      "Walk-in Customer";

    const result = await (prisma as any).$transaction(async (tx: any) => {
      if (customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, businessId },
          select: { id: true, name: true },
        });

        if (!customer) throw new Error("Invalid customer for this business");

        customerName = customer.name;
      }

      const productIds = [
        ...new Set(
          items
            .map((item) => cleanString(item.productId))
            .filter((id): id is string => Boolean(id))
        ),
      ];

      if (productIds.length !== items.length) {
        throw new Error("Each item must have productId");
      }

      const products = await tx.product.findMany({
        where: {
          businessId,
          id: { in: productIds },
          deleted: false,
        },
      });

      const productById = new Map<string, any>(
        products.map((product: any) => [String(product.id), product])
      );

      if (products.length !== productIds.length) {
        throw new Error("One or more products are invalid");
      }

      let subtotal = 0;
      let discountTotal = 0;
      let taxTotal = 0;

      const preparedItems = items.map((item) => {
        const productId = cleanString(item.productId) as string;
        const product = productById.get(productId);

        if (!product) throw new Error(`Product not found: ${productId}`);

        const qty = toNumber(item.qty);

        if (qty <= 0) {
          throw new Error(`Qty must be greater than zero for ${product.name}`);
        }

        const rate = toNumber(
          item.unitPrice ?? item.rate ?? item.price,
          Number(product.price || 0)
        );

        const linePrice = roundMoney(qty * rate);
        const discount = toNumber(item.discountAmount ?? item.discount);
        const taxRate = toNumber(item.taxRate);
        const taxableAmount = Math.max(0, linePrice - discount);
        const tax = roundMoney((taxableAmount * taxRate) / 100);
        const total = roundMoney(taxableAmount + tax);

        subtotal = roundMoney(subtotal + linePrice);
        discountTotal = roundMoney(discountTotal + discount);
        taxTotal = roundMoney(taxTotal + tax);

        return {
          product,
          productId,
          sku: product.sku || cleanString(item.sku),
          barcode: product.barcode || cleanString(item.barcode),
          qrCode: product.qrCode || cleanString(item.qrCode),
          name: product.name || cleanString(item.name) || "Item",
          description: cleanString(item.description),
          unit: product.unit || cleanString(item.unit) || "PCS",
          qty,
          rate,
          price: linePrice,
          discount,
          taxRate,
          tax,
          total,
        };
      });

      const headerDiscount = toNumber(req.body?.discount ?? req.body?.discountTotal);
      discountTotal = roundMoney(discountTotal + headerDiscount);

      const total = roundMoney(subtotal - discountTotal + taxTotal);

      const paid =
        documentType === "INVOICE"
          ? Math.min(Math.max(0, toNumber(req.body?.paid ?? req.body?.paidTotal)), total)
          : 0;

      const balance = documentType === "INVOICE" ? roundMoney(total - paid) : 0;

      const paymentStatus =
        documentType === "INVOICE" ? getPaymentStatus(total, paid) : "not_applicable";

      const stockStatus = documentType === "INVOICE" ? "posted" : "not_posted";
      const documentPrefix = getDocumentPrefix(documentType as any);

      const documentNo = await getNextDocumentNumber(
        tx,
        businessId,
        branchId ?? null,
        documentType as any
      );

      if (documentType === "INVOICE") {
        for (const item of preparedItems) {
          const currentStock = Number(item.product.currentStock || 0);

          if (currentStock < item.qty) {
            throw new Error(
              `Insufficient stock for ${item.name}. Available: ${currentStock}, Required: ${item.qty}`
            );
          }
        }
      }

      const document = await tx.salesDocument.create({
        data: {
          businessId,
          branchId: branchId ?? null,
          documentNo,
          documentType,
          documentPrefix,
          lpoNo: cleanString(req.body?.lpoNo) ?? null,
          customerPoNo: cleanString(req.body?.customerPoNo) ?? null,
          poNo: cleanString(req.body?.poNo) ?? null,
          customerId: customerId ?? null,
          customerName,
          salesmanId: cleanString(req.body?.salesmanId) ?? null,
          salesmanName: cleanString(req.body?.salesmanName) ?? null,
          paymentMethod: cleanString(req.body?.paymentMethod) ?? null,
          paymentStatus,
          stockStatus,
          status: "ISSUED",
          subtotal,
          discount: discountTotal,
          tax: taxTotal,
          total,
          paid,
          balance,
          creditAmount: documentType === "INVOICE" ? balance : 0,
          customerCreditApplied: false,
          dueDate: toDate(req.body?.dueDate) ?? null,
          issuedAt: toDate(req.body?.documentDate) ?? new Date(),
          metadata: {
            notes: cleanString(req.body?.notes) ?? null,
            createdById: userId ?? null,
            source: "api",
          },
          items: {
            create: preparedItems.map((item) => ({
              businessId,
              productId: item.productId,
              sku: item.sku ?? null,
              barcode: item.barcode ?? null,
              qrCode: item.qrCode ?? null,
              name: item.name,
              description: item.description ?? null,
              unit: item.unit,
              qty: item.qty,
              rate: item.rate,
              price: item.price,
              discount: item.discount,
              taxRate: item.taxRate,
              tax: item.tax,
              total: item.total,
            })),
          },
        },
        include: { items: true },
      });

      if (documentType === "INVOICE") {
        for (let index = 0; index < preparedItems.length; index += 1) {
          const item = preparedItems[index];
          const beforeQty = Number(item.product.currentStock || 0);
          const afterQty = roundMoney(beforeQty - item.qty);

          await tx.product.update({
            where: { id: item.productId },
            data: {
              currentStock: {
                decrement: item.qty,
              },
            },
          });

          await tx.stockMovement.create({
            data: {
              businessId,
              movementNo: `${documentNo}-${String(index + 1).padStart(3, "0")}`,
              productId: item.productId,
              sku: item.sku ?? null,
              productName: item.name,
              warehouseId: warehouseId ?? null,
              direction: "OUT",
              movementType: "sales_invoice",
              referenceNo: documentNo,
              qty: item.qty,
              beforeQty,
              afterQty,
              source: "sales_document",
              metadata: {
                salesDocumentId: document.id,
                createdById: userId ?? null,
              },
            },
          });
        }
      }

      return document;
    });

    return res.status(201).json({
      ok: true,
      message: "Sales document created successfully",
      data: formatSalesDocument(result),
    });
  } catch (error: any) {
    console.error("createSalesDocument error:", error);

    return res.status(400).json({
      ok: false,
      error: {
        message: error?.message || "Failed to create sales document",
      },
    });
  }
}
