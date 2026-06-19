import type { DocumentType, Prisma, SalesDocumentStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { getNextDocumentNumber } from '../utils/document-number.js';

type SalesDocumentWithItems = Prisma.SalesDocumentGetPayload<{
  include: {
    items: true;
  };
}>;

type PreparedSalesItem = {
  productId: string | null;
  sku: string | null;
  barcode: string | null;
  qrCode: string | null;
  name: string;
  description: string | null;
  unit: string;
  qty: number;
  rate: number;
  price: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
};

class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getBusinessId(req: Request, res: Response): string | null {
  const businessId = req.tenant?.businessId;

  if (!businessId) {
    res.status(401).json({
      ok: false,
      error: {
        message: 'Authenticated business is required'
      }
    });
    return null;
  }

  return businessId;
}

function cleanString(value: unknown): string | undefined {
  const text = String(value || '').trim();

  return text || undefined;
}

function parseNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function parseDocumentType(value: unknown): DocumentType | null {
  const text = String(value || 'INVOICE').trim().toUpperCase();

  if (text === 'INVOICE') {
    return 'INVOICE';
  }

  if (text === 'QUOTATION') {
    return 'QUOTATION';
  }

  if (text === 'DELIVERY_NOTE' || text === 'DN' || text === 'DELIVERY NOTE') {
    return 'DELIVERY_NOTE';
  }

  return null;
}

function parseStatus(value: unknown): SalesDocumentStatus | null {
  const text = cleanString(value)?.toUpperCase();

  if (!text) {
    return null;
  }

  if (
    text === 'DRAFT' ||
    text === 'ISSUED' ||
    text === 'PAID' ||
    text === 'PARTIALLY_PAID' ||
    text === 'CREDIT' ||
    text === 'CANCELLED' ||
    text === 'VOID'
  ) {
    return text as SalesDocumentStatus;
  }

  return null;
}

function calculateStatus(
  documentType: DocumentType,
  total: number,
  paid: number,
  explicitStatus: SalesDocumentStatus | null
): SalesDocumentStatus {
  if (explicitStatus) {
    return explicitStatus;
  }

  if (documentType === 'QUOTATION' || documentType === 'DELIVERY_NOTE') {
    return 'ISSUED';
  }

  if (paid >= total && total > 0) {
    return 'PAID';
  }

  if (paid > 0 && paid < total) {
    return 'PARTIALLY_PAID';
  }

  if (total > 0) {
    return 'CREDIT';
  }

  return 'ISSUED';
}

function paymentStatusFromAmounts(total: number, paid: number): string {
  if (paid >= total && total > 0) {
    return 'paid';
  }

  if (paid > 0 && paid < total) {
    return 'partial';
  }

  if (total > 0) {
    return 'credit';
  }

  return 'unpaid';
}

function shouldAffectStock(documentType: DocumentType, status: SalesDocumentStatus): boolean {
  if (status === 'DRAFT' || status === 'CANCELLED' || status === 'VOID') {
    return false;
  }

  return documentType === 'INVOICE' || documentType === 'DELIVERY_NOTE';
}

function formatSalesDocument(document: SalesDocumentWithItems) {
  return {
    id: document.id,
    businessId: document.businessId,
    branchId: document.branchId,
    documentNo: document.documentNo,
    documentType: document.documentType,
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
    status: document.status,
    subtotal: Number(document.subtotal),
    discount: Number(document.discount),
    tax: Number(document.tax),
    total: Number(document.total),
    paid: Number(document.paid),
    balance: Number(document.balance),
    creditAmount: Number(document.creditAmount),
    customerCreditApplied: document.customerCreditApplied,
    dueDate: document.dueDate,
    issuedAt: document.issuedAt,
    metadata: document.metadata,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    items: document.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      barcode: item.barcode,
      qrCode: item.qrCode,
      name: item.name,
      description: item.description,
      unit: item.unit,
      qty: Number(item.qty),
      rate: Number(item.rate),
      price: Number(item.price),
      discount: Number(item.discount),
      taxRate: Number(item.taxRate),
      tax: Number(item.tax),
      total: Number(item.total),
      createdAt: item.createdAt
    }))
  };
}

async function resolveBranchId(businessId: string, requestedBranchId: string | undefined): Promise<string | null> {
  if (requestedBranchId) {
    const branch = await prisma.branch.findFirst({
      where: {
        id: requestedBranchId,
        businessId,
        active: true
      }
    });

    if (!branch) {
      throw new ApiError(404, 'Branch not found');
    }

    return branch.id;
  }

  const defaultBranch = await prisma.branch.findFirst({
    where: {
      businessId,
      active: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  return defaultBranch?.id || null;
}

async function resolveCustomer(
  businessId: string,
  customerId: string | undefined,
  fallbackCustomerName: string | undefined
): Promise<{ id: string | null; name: string }> {
  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId,
        active: true
      }
    });

    if (!customer) {
      throw new ApiError(404, 'Customer not found');
    }

    return {
      id: customer.id,
      name: customer.name
    };
  }

  return {
    id: null,
    name: fallbackCustomerName || 'Walk-in Customer'
  };
}

async function prepareSalesItems(businessId: string, rawItems: unknown): Promise<PreparedSalesItem[]> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new ApiError(400, 'At least one sales item is required');
  }

  const preparedItems: PreparedSalesItem[] = [];

  for (const rawItem of rawItems) {
    const item = rawItem as Record<string, unknown>;

    const productId = cleanString(item.productId);
    const sku = cleanString(item.sku);

    let product:
      | {
          id: string;
          sku: string;
          barcode: string | null;
          qrCode: string | null;
          name: string;
          unit: string | null;
          price: unknown;
          currentStock: unknown;
          active: boolean;
          deleted: boolean;
        }
      | null = null;

    if (productId) {
      product = await prisma.product.findFirst({
        where: {
          id: productId,
          businessId,
          active: true,
          deleted: false
        },
        select: {
          id: true,
          sku: true,
          barcode: true,
          qrCode: true,
          name: true,
          unit: true,
          price: true,
          currentStock: true,
          active: true,
          deleted: true
        }
      });
    } else if (sku) {
      product = await prisma.product.findFirst({
        where: {
          sku,
          businessId,
          active: true,
          deleted: false
        },
        select: {
          id: true,
          sku: true,
          barcode: true,
          qrCode: true,
          name: true,
          unit: true,
          price: true,
          currentStock: true,
          active: true,
          deleted: true
        }
      });
    }

    const name = cleanString(item.name) || product?.name;
    const qty = parseNumber(item.qty, 0);

    if (!name) {
      throw new ApiError(400, 'Sales item name is required');
    }

    if (qty <= 0) {
      throw new ApiError(400, `Invalid quantity for item ${name}`);
    }

    const unit = cleanString(item.unit) || product?.unit || 'PCS';
    const rate = parseNumber(item.rate ?? item.price, product ? Number(product.price) : 0);
    const price = parseNumber(item.price, rate);
    const discount = parseNumber(item.discount, 0);
    const taxRate = parseNumber(item.taxRate, 0);

    const lineSubtotal = qty * rate;
    const taxableAmount = Math.max(lineSubtotal - discount, 0);
    const tax = Number(((taxableAmount * taxRate) / 100).toFixed(2));
    const total = Number((taxableAmount + tax).toFixed(2));

    preparedItems.push({
      productId: product?.id || null,
      sku: sku || product?.sku || null,
      barcode: cleanString(item.barcode) || product?.barcode || null,
      qrCode: cleanString(item.qrCode) || product?.qrCode || null,
      name,
      description: cleanString(item.description) || null,
      unit,
      qty,
      rate,
      price,
      discount,
      taxRate,
      tax,
      total
    });
  }

  return preparedItems;
}

export async function listSalesDocuments(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const q = cleanString(req.query.q);
    const documentType = req.query.type ? parseDocumentType(req.query.type) : null;
    const status = req.query.status ? parseStatus(req.query.status) : null;

    const where: Prisma.SalesDocumentWhereInput = {
      businessId
    };

    if (documentType) {
      where.documentType = documentType;
    }

    if (status) {
      where.status = status;
    }

    if (q) {
      where.OR = [
        {
          documentNo: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          customerName: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          lpoNo: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          customerPoNo: {
            contains: q,
            mode: 'insensitive'
          }
        },
        {
          poNo: {
            contains: q,
            mode: 'insensitive'
          }
        }
      ];
    }

    const documents = await prisma.salesDocument.findMany({
      where,
      include: {
        items: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });

    res.json({
      ok: true,
      count: documents.length,
      salesDocuments: documents.map(formatSalesDocument)
    });
  } catch (error) {
    console.error('List sales documents failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to list sales documents'
      }
    });
  }
}

export async function getSalesDocument(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const id = cleanString(req.params.id);

    if (!id) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'Sales document id is required'
        }
      });
      return;
    }

    const document = await prisma.salesDocument.findFirst({
      where: {
        id,
        businessId
      },
      include: {
        items: true
      }
    });

    if (!document) {
      res.status(404).json({
        ok: false,
        error: {
          message: 'Sales document not found'
        }
      });
      return;
    }

    res.json({
      ok: true,
      salesDocument: formatSalesDocument(document)
    });
  } catch (error) {
    console.error('Get sales document failed:', error);

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to get sales document'
      }
    });
  }
}

export async function createSalesDocument(req: Request, res: Response): Promise<void> {
  try {
    const businessId = getBusinessId(req, res);

    if (!businessId) {
      return;
    }

    const documentType = parseDocumentType(req.body?.documentType);

    if (!documentType) {
      res.status(400).json({
        ok: false,
        error: {
          message: 'Invalid documentType. Use INVOICE, QUOTATION, or DELIVERY_NOTE'
        }
      });
      return;
    }

    const branchId = await resolveBranchId(businessId, cleanString(req.body?.branchId));
    const customer = await resolveCustomer(
      businessId,
      cleanString(req.body?.customerId),
      cleanString(req.body?.customerName)
    );

    const items = await prepareSalesItems(businessId, req.body?.items);

    const subtotal = Number(items.reduce((sum, item) => sum + item.qty * item.rate, 0).toFixed(2));
    const itemDiscountTotal = Number(items.reduce((sum, item) => sum + item.discount, 0).toFixed(2));
    const headerDiscount = parseNumber(req.body?.discount, 0);
    const discount = Number((itemDiscountTotal + headerDiscount).toFixed(2));
    const tax = Number(items.reduce((sum, item) => sum + item.tax, 0).toFixed(2));
    const total = Number(Math.max(subtotal - discount + tax, 0).toFixed(2));
    const paid = Number(Math.min(parseNumber(req.body?.paid, 0), total).toFixed(2));
    const balance = Number(Math.max(total - paid, 0).toFixed(2));
    const explicitStatus = parseStatus(req.body?.status);
    const status = calculateStatus(documentType, total, paid, explicitStatus);
    const paymentStatus = cleanString(req.body?.paymentStatus) || paymentStatusFromAmounts(total, paid);
    const stockAffects = shouldAffectStock(documentType, status);

    const document = await prisma.$transaction(async (tx) => {
      const documentNo =
        cleanString(req.body?.documentNo) ||
        (await getNextDocumentNumber(tx, businessId, branchId, documentType));

      const createdDocument = await tx.salesDocument.create({
        data: {
          businessId,
          branchId,
          documentNo,
          documentType,
          documentPrefix: documentNo.split('-')[0] || null,
          lpoNo: cleanString(req.body?.lpoNo),
          customerPoNo: cleanString(req.body?.customerPoNo),
          poNo: cleanString(req.body?.poNo),
          customerId: customer.id,
          customerName: customer.name,
          salesmanId: cleanString(req.body?.salesmanId),
          salesmanName: cleanString(req.body?.salesmanName),
          paymentMethod: cleanString(req.body?.paymentMethod),
          paymentStatus,
          stockStatus: stockAffects ? 'posted' : 'not_posted',
          status,
          subtotal,
          discount,
          tax,
          total,
          paid,
          balance,
          creditAmount: balance,
          customerCreditApplied: balance > 0 && documentType === 'INVOICE',
          dueDate: req.body?.dueDate ? new Date(String(req.body.dueDate)) : null,
          issuedAt: new Date(),
          metadata: req.body?.metadata ?? undefined
        }
      });

      await tx.salesDocumentItem.createMany({
        data: items.map((item) => ({
          businessId,
          salesDocumentId: createdDocument.id,
          productId: item.productId,
          sku: item.sku,
          barcode: item.barcode,
          qrCode: item.qrCode,
          name: item.name,
          description: item.description,
          unit: item.unit,
          qty: item.qty,
          rate: item.rate,
          price: item.price,
          discount: item.discount,
          taxRate: item.taxRate,
          tax: item.tax,
          total: item.total
        }))
      });

      if (stockAffects) {
        for (const item of items) {
          if (!item.productId) {
            continue;
          }

          const product = await tx.product.findFirst({
            where: {
              id: item.productId,
              businessId,
              active: true,
              deleted: false
            }
          });

          if (!product) {
            throw new ApiError(404, `Product not found for item ${item.name}`);
          }

          const currentStock = Number(product.currentStock);

          if (currentStock < item.qty) {
            throw new ApiError(400, `Insufficient stock for ${product.name}`);
          }

          await tx.product.update({
            where: {
              id: product.id
            },
            data: {
              currentStock: Number((currentStock - item.qty).toFixed(3))
            }
          });
        }
      }

      if (documentType === 'INVOICE' && customer.id && balance > 0) {
        await tx.customer.update({
          where: {
            id: customer.id
          },
          data: {
            balance: {
              increment: balance
            }
          }
        });
      }

      const documentWithItems = await tx.salesDocument.findUnique({
        where: {
          id: createdDocument.id
        },
        include: {
          items: true
        }
      });

      if (!documentWithItems) {
        throw new ApiError(500, 'Sales document was not created');
      }

      return documentWithItems;
    });

    res.status(201).json({
      ok: true,
      salesDocument: formatSalesDocument(document)
    });
  } catch (error) {
    console.error('Create sales document failed:', error);

    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        ok: false,
        error: {
          message: error.message
        }
      });
      return;
    }

    res.status(500).json({
      ok: false,
      error: {
        message: 'Failed to create sales document'
      }
    });
  }
}
