import { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import * as documentNumberUtil from "../utils/document-number.js";

type SalesDocumentTypeInput = "invoice" | "quotation" | "delivery_note";

type CreateSalesDocumentItemInput = {
  productId: string;
  batchId?: string;
  qty: number;
  unitPrice?: number;
  discountAmount?: number;
  taxRate?: number;
};

const allowedDocumentTypes: SalesDocumentTypeInput[] = [
  "invoice",
  "quotation",
  "delivery_note",
];

function getBusinessId(req: Request) {
  return (req as any).businessId as string | undefined;
}

function getUserId(req: Request) {
  return (req as any).userId as string | undefined;
}

function isValidDocumentType(value: unknown): value is SalesDocumentTypeInput {
  return (
    typeof value === "string" &&
    allowedDocumentTypes.includes(value as SalesDocumentTypeInput)
  );
}

function getCounterType(documentType: SalesDocumentTypeInput) {
  if (documentType === "invoice") return "invoice";
  if (documentType === "quotation") return "quotation";
  return "delivery_note";
}

function fallbackDocumentNumber(
  documentType: SalesDocumentTypeInput,
  nextNumber: number,
  padding = 6
) {
  const prefixes: Record<SalesDocumentTypeInput, string> = {
    invoice: "INV-",
    quotation: "QUO-",
    delivery_note: "DN-",
  };

  return `${prefixes[documentType]}${String(nextNumber).padStart(padding, "0")}`;
}

function generateDocumentNo(
  documentType: SalesDocumentTypeInput,
  nextNumber: number,
  padding = 6
) {
  const utilFn = (documentNumberUtil as any).generateDocumentNumber;

  if (typeof utilFn === "function") {
    return utilFn(documentType, nextNumber, padding);
  }

  return fallbackDocumentNumber(documentType, nextNumber, padding);
}

function toNumber(value: unknown, defaultValue = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function toDateOnly(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  }

  const now = new Date();
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function getPaymentStatus(grandTotal: number, paidTotal: number) {
  if (paidTotal <= 0) return "unpaid";
  if (paidTotal >= grandTotal) return "paid";
  return "partial";
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

    const where: any = {
      businessId,
    };

    if (isValidDocumentType(req.query.documentType)) {
      where.documentType = req.query.documentType;
    }

    if (typeof req.query.customerId === "string" && req.query.customerId.trim()) {
      where.customerId = req.query.customerId;
    }

    if (typeof req.query.status === "string" && req.query.status.trim()) {
      where.status = req.query.status;
    }

    const documents = await (prisma as any).salesDocument.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        customer: true,
        branch: true,
        items: {
          include: {
            product: true,
            batch: true,
          },
        },
      },
    });

    return res.json({
      ok: true,
      data: documents,
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
    const { id } = req.params;

    if (!businessId) {
      return res.status(401).json({
        ok: false,
        error: { message: "Unauthorized: business context missing" },
      });
    }

    const document = await (prisma as any).salesDocument.findFirst({
      where: {
        id,
        businessId,
      },
      include: {
        customer: true,
        branch: true,
        items: {
          include: {
            product: true,
            batch: true,
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({
        ok: false,
        error: { message: "Sales document not found" },
      });
    }

    return res.json({
      ok: true,
      data: document,
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

    const documentType = req.body.documentType;

    if (!isValidDocumentType(documentType)) {
      return res.status(400).json({
        ok: false,
        error: {
          message: "Invalid documentType. Use invoice, quotation, or delivery_note",
        },
      });
    }

    const items = Array.isArray(req.body.items)
      ? (req.body.items as CreateSalesDocumentItemInput[])
      : [];

    if (items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: { message: "At least one item is required" },
      });
    }

    for (const item of items) {
      if (!item.productId) {
        return res.status(400).json({
          ok: false,
          error: { message: "Each item must have productId" },
        });
      }

      if (toNumber(item.qty) <= 0) {
        return res.status(400).json({
          ok: false,
          error: { message: "Each item qty must be greater than zero" },
        });
      }
    }

    const result = await (prisma as any).$transaction(async (tx: any) => {
      let branchId =
        typeof req.body.branchId === "string" ? req.body.branchId : undefined;

      if (!branchId && userId) {
        const user = await tx.user.findFirst({
          where: {
            id: userId,
            businessId,
          },
          select: {
            branchId: true,
          },
        });

        branchId = user?.branchId || undefined;
      }

      if (!branchId) {
        const defaultBranch = await tx.branch.findFirst({
          where: {
            businessId,
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
          },
        });

        branchId = defaultBranch?.id;
      }

      if (!branchId) {
        throw new Error("No branch found for this business");
      }

      const customerId =
        typeof req.body.customerId === "string" ? req.body.customerId : undefined;

      let customerNameSnapshot: string | undefined;

      if (customerId) {
        const customer = await tx.customer.findFirst({
          where: {
            id: customerId,
            businessId,
          },
          select: {
            id: true,
            name: true,
          },
        });

        if (!customer) {
          throw new Error("Invalid customer for this business");
        }

        customerNameSnapshot = customer.name;
      }

      const productIds = [...new Set(items.map((item) => item.productId))];

      const products: any[] = await tx.product.findMany({
        where: {
          id: {
            in: productIds,
          },
          businessId,
        },
      });

      const productById = new Map<string, any>(
        products.map((product: any) => [String(product.id), product] as [string, any])
      );

      if (products.length !== productIds.length) {
        throw new Error("One or more products are invalid");
      }

      const counterType = getCounterType(documentType);

      const counter = await tx.counter.findFirst({
        where: {
          businessId,
          branchId,
          counterType,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (!counter) {
        throw new Error(`Missing counter for ${counterType}. Seed counters first.`);
      }

      const documentNo = generateDocumentNo(
        documentType,
        Number(counter.nextNumber),
        Number(counter.padding || 6)
      );

      await tx.counter.update({
        where: {
          id: counter.id,
        },
        data: {
          nextNumber: {
            increment: 1,
          },
        },
      });

      let subtotal = 0;
      let itemDiscountTotal = 0;
      let taxTotal = 0;

      const preparedItems: any[] = [];

      for (const item of items) {
        const product: any = productById.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        const qty = toNumber(item.qty);
        const unitPrice = toNumber(item.unitPrice, Number(product.salePrice || 0));
        const discountAmount = toNumber(item.discountAmount);
        const taxRate = toNumber(item.taxRate, Number(product.taxRate || 0));

        const grossLine = roundMoney(qty * unitPrice);
        const taxableAmount = Math.max(0, grossLine - discountAmount);
        const taxAmount = roundMoney((taxableAmount * taxRate) / 100);
        const lineTotal = roundMoney(taxableAmount + taxAmount);

        subtotal = roundMoney(subtotal + grossLine);
        itemDiscountTotal = roundMoney(itemDiscountTotal + discountAmount);
        taxTotal = roundMoney(taxTotal + taxAmount);

        preparedItems.push({
          product,
          batchId: item.batchId,
          qty,
          unitPrice,
          discountAmount,
          taxRate,
          taxAmount,
          lineTotal,
        });
      }

      const headerDiscountTotal = toNumber(req.body.discountTotal);
      const discountTotal = roundMoney(itemDiscountTotal + headerDiscountTotal);
      const grandTotal = roundMoney(subtotal - discountTotal + taxTotal);

      const requestedPaidTotal = toNumber(req.body.paidTotal);
      const paidTotal =
        documentType === "invoice"
          ? Math.min(Math.max(0, requestedPaidTotal), grandTotal)
          : 0;

      const balanceTotal =
        documentType === "invoice" ? roundMoney(grandTotal - paidTotal) : 0;

      const paymentStatus =
        documentType === "invoice"
          ? getPaymentStatus(grandTotal, paidTotal)
          : "unpaid";

      const status = documentType === "invoice" ? "completed" : "issued";

      const document = await tx.salesDocument.create({
        data: {
          businessId,
          branchId,
          documentType,
          documentNo,
          status,
          customerId,
          customerNameSnapshot,
          subtotal,
          discountTotal,
          taxTotal,
          grandTotal,
          paidTotal,
          balanceTotal,
          paymentStatus,
          documentDate: toDateOnly(req.body.documentDate),
          dueDate: req.body.dueDate ? toDateOnly(req.body.dueDate) : null,
          notes: typeof req.body.notes === "string" ? req.body.notes : null,
          createdById: userId || null,
          updatedById: userId || null,
          items: {
            create: preparedItems.map((item: any) => ({
              productId: item.product.id,
              batchId: item.batchId || null,
              productNameSnapshot: item.product.name,
              skuSnapshot: item.product.sku || null,
              qty: item.qty,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount,
              taxRate: item.taxRate,
              taxAmount: item.taxAmount,
              lineTotal: item.lineTotal,
            })),
          },
        },
        include: {
          customer: true,
          branch: true,
          items: true,
        },
      });

      if (documentType === "invoice") {
        for (const item of preparedItems) {
          let batch = null;

          if (item.batchId) {
            batch = await tx.productBatch.findFirst({
              where: {
                id: item.batchId,
                businessId,
                branchId,
                productId: item.product.id,
              },
            });
          }

          if (!batch) {
            batch = await tx.productBatch.findFirst({
              where: {
                businessId,
                branchId,
                productId: item.product.id,
                currentQty: {
                  gt: 0,
                },
              },
              orderBy: {
                createdAt: "asc",
              },
            });
          }

          if (!batch) {
            throw new Error(`No stock batch found for product: ${item.product.name}`);
          }

          const currentQty = Number(batch.currentQty);

          if (currentQty < item.qty) {
            throw new Error(
              `Insufficient stock for ${item.product.name}. Available: ${currentQty}, Required: ${item.qty}`
            );
          }

          const newRunningQty = roundMoney(currentQty - item.qty);

          await tx.productBatch.update({
            where: {
              id: batch.id,
            },
            data: {
              currentQty: {
                decrement: item.qty,
              },
            },
          });

          await tx.stockLedger.create({
            data: {
              businessId,
              branchId,
              productId: item.product.id,
              batchId: batch.id,
              movementType: "sale_issue",
              sourceType: "sales_document",
              sourceId: document.id,
              qtyIn: 0,
              qtyOut: item.qty,
              unitCost: item.product.costPrice || 0,
              runningQty: newRunningQty,
              note: `Stock deducted for invoice ${document.documentNo}`,
              createdById: userId || null,
            },
          });
        }

        if (customerId && balanceTotal > 0) {
          await tx.customerLedger.create({
            data: {
              businessId,
              customerId,
              branchId,
              entryType: "sales_invoice",
              sourceType: "sales_document",
              sourceId: document.id,
              salesDocumentId: document.id,
              debit: balanceTotal,
              credit: 0,
              entryDate: toDateOnly(req.body.documentDate),
              notes: `Credit balance for invoice ${document.documentNo}`,
              createdById: userId || null,
            },
          });
        }
      }

      return document;
    });

    return res.status(201).json({
      ok: true,
      message: "Sales document created successfully",
      data: result,
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
