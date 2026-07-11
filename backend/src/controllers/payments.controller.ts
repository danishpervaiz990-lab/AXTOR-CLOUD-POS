import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { writeAudit } from "../services/audit.service.js";
import { loadUserAccess, requirePermission } from "../services/access.service.js";

type PaymentStatus = "unpaid" | "partial" | "paid" | "not_applicable";

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

function toDate(value: unknown): Date {
  const text = cleanString(value);
  if (!text) return new Date();

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getPaymentStatus(total: number, paid: number): PaymentStatus {
  if (total <= 0) return "not_applicable";
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

function getSalesDocumentStatus(total: number, paid: number) {
  if (paid >= total) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  return "ISSUED";
}

function formatSalesDocument(document: any) {
  if (!document) return null;

  return {
    id: document.id,
    businessId: document.businessId,
    branchId: document.branchId,
    documentNo: document.documentNo,
    documentType: String(document.documentType || "").toLowerCase(),
    documentTypeRaw: document.documentType,
    documentPrefix: document.documentPrefix,
    lpoNo: document.lpoNo,
    customerPoNo: document.customerPoNo,
    poNo: document.poNo,
    customerId: document.customerId,
    customerName: document.customerName,
    paymentMethod: document.paymentMethod,
    paymentStatus: document.paymentStatus,
    status: String(document.status || "").toLowerCase(),
    statusRaw: document.status,
    subtotal: Number(document.subtotal || 0),
    discount: Number(document.discount || 0),
    tax: Number(document.tax || 0),
    total: Number(document.total || 0),
    paid: Number(document.paid || 0),
    balance: Number(document.balance || 0),
    creditAmount: Number(document.creditAmount || 0),
    dueDate: document.dueDate,
    issuedAt: document.issuedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function formatPayment(payment: any) {
  const allocation = payment.allocation || {};

  return {
    id: payment.id,
    businessId: payment.businessId,
    receiptNo: payment.receiptNo,
    customerId: payment.customerId,
    customerName: payment.customerName,
    amount: Number(payment.amount || 0),
    paymentMethod: payment.method,
    method: payment.method,
    depositAccount: allocation.depositAccount ?? null,
    accountId: payment.accountId,
    referenceNo: payment.referenceNo,
    idempotencyKey: payment.idempotencyKey,
    notes: allocation.notes ?? null,
    salesDocumentId: allocation.salesDocumentId ?? null,
    salesDocumentNo: allocation.salesDocumentNo ?? null,
    allocation,
    paymentDate: payment.paymentDate,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

async function getNextReceiptNo(tx: any, businessId: string) {
  await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `axtor:receipt-counter:${businessId}`);
  const prefix = "RCPT";
  const existingCount = await tx.customerPayment.count({
    where: { businessId },
  });

  for (let offset = 1; offset <= 25; offset += 1) {
    const next = existingCount + offset;
    const receiptNo = `${prefix}-${String(next).padStart(6, "0")}`;

    const existing = await tx.customerPayment.findFirst({
      where: { businessId, receiptNo },
      select: { id: true },
    });

    if (!existing) return receiptNo;
  }

  return `${prefix}-${Date.now()}`;
}

export async function listPayments(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(401).json({
        ok: false,
        error: { message: "Unauthorized: business context missing" },
      });
    }

    const customerId = cleanString(req.query.customerId);
    const salesDocumentId = cleanString(req.query.salesDocumentId);
    const q = cleanString(req.query.q);

    const where: any = { businessId };

    if (customerId) where.customerId = customerId;

    if (q) {
      where.OR = [
        { receiptNo: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { referenceNo: { contains: q, mode: "insensitive" } },
      ];
    }

    const payments = await (prisma as any).customerPayment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const filteredPayments = salesDocumentId
      ? payments.filter((payment: any) => {
          const allocation = payment.allocation || {};
          return String(allocation.salesDocumentId || "") === salesDocumentId;
        })
      : payments;

    return res.json({
      ok: true,
      count: filteredPayments.length,
      data: filteredPayments.map(formatPayment),
    });
  } catch (error) {
    console.error("listPayments error:", error);

    return res.status(500).json({
      ok: false,
      error: { message: "Failed to list payments" },
    });
  }
}

export async function getPaymentById(req: Request, res: Response) {
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
        error: { message: "Payment id is required" },
      });
    }

    const payment = await (prisma as any).customerPayment.findFirst({
      where: { id, businessId },
    });

    if (!payment) {
      return res.status(404).json({
        ok: false,
        error: { message: "Payment not found" },
      });
    }

    return res.json({
      ok: true,
      data: formatPayment(payment),
    });
  } catch (error) {
    console.error("getPaymentById error:", error);

    return res.status(500).json({
      ok: false,
      error: { message: "Failed to get payment" },
    });
  }
}

export async function createPayment(req: Request, res: Response) {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(401).json({
        ok: false,
        error: { message: "Unauthorized: business context missing" },
      });
    }

    const salesDocumentId = cleanString(req.body?.salesDocumentId);
    const amount = roundMoney(toNumber(req.body?.amount));
    const idempotencyKey = cleanString(req.body?.idempotencyKey) || cleanString(req.headers["idempotency-key"]);

    if (!salesDocumentId) {
      return res.status(400).json({
        ok: false,
        error: { message: "salesDocumentId is required" },
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        ok: false,
        error: { message: "Payment amount must be greater than zero" },
      });
    }

    const result = await prisma.$transaction(async (tx: any) => {
      const access = await loadUserAccess(tx, businessId, getUserId(req));
      requirePermission(access, "payments.create", true);
      if (idempotencyKey) {
        await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `axtor:payment-idempotency:${businessId}:${idempotencyKey}`);
        const existing = await tx.customerPayment.findFirst({ where: { businessId, idempotencyKey } });
        if (existing) {
          const linkedId = existing.allocation && typeof existing.allocation === "object" ? existing.allocation.salesDocumentId : null;
          const existingInvoice = linkedId ? await tx.salesDocument.findFirst({ where: { id: linkedId, businessId } }) : null;
          return { payment: existing, updatedInvoice: existingInvoice, duplicate: true };
        }
      }

      const invoice = await tx.salesDocument.findFirst({
        where: {
          id: salesDocumentId,
          businessId,
          documentType: "INVOICE",
        },
      });

      if (!invoice) {
        throw new Error("Sales invoice not found for this business");
      }

      if (["CANCELLED", "VOID"].includes(String(invoice.status))) {
        throw new Error("Cannot receive payment for cancelled/void invoice");
      }

      const total = roundMoney(Number(invoice.total || 0));
      const previousPaid = roundMoney(Number(invoice.paid || 0));
      const currentBalance = roundMoney(Number(invoice.balance ?? total - previousPaid));

      if (currentBalance <= 0) {
        throw new Error("Invoice is already fully paid");
      }

      if (amount > currentBalance) {
        throw new Error(`Payment amount cannot exceed balance ${currentBalance.toFixed(2)}`);
      }

      const customerId = cleanString(req.body?.customerId) ?? invoice.customerId ?? null;
      let customerName = invoice.customerName || "Walk-in Customer";

      if (customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, businessId },
          select: { id: true, name: true, balance: true },
        });

        if (customer) {
          customerName = customer.name;
        }
      }

      const nextPaid = roundMoney(previousPaid + amount);
      const nextBalance = roundMoney(Math.max(0, total - nextPaid));
      const nextStatus = getSalesDocumentStatus(total, nextPaid);
      const nextPaymentStatus = getPaymentStatus(total, nextPaid);
      const receiptNo = await getNextReceiptNo(tx, businessId);

      const payment = await tx.customerPayment.create({
        data: {
          businessId,
          receiptNo,
          customerId,
          customerName,
          amount,
          method: cleanString(req.body?.paymentMethod) ?? cleanString(req.body?.method) ?? "cash",
          accountId: cleanString(req.body?.accountId) ?? null,
          referenceNo: cleanString(req.body?.referenceNo) ?? null,
          idempotencyKey: idempotencyKey ?? null,
          paymentDate: toDate(req.body?.paymentDate),
          allocation: {
            salesDocumentId: invoice.id,
            salesDocumentNo: invoice.documentNo,
            customerId,
            customerName,
            amount,
            previousPaid,
            previousBalance: currentBalance,
            paidAfterPayment: nextPaid,
            balanceAfterPayment: nextBalance,
            paymentMethod:
              cleanString(req.body?.paymentMethod) ?? cleanString(req.body?.method) ?? "cash",
            depositAccount: cleanString(req.body?.depositAccount) ?? null,
            referenceNo: cleanString(req.body?.referenceNo) ?? null,
            notes: cleanString(req.body?.notes) ?? null,
          },
        },
      });

      const updatedInvoice = await tx.salesDocument.update({
        where: { id: invoice.id },
        data: {
          paid: nextPaid,
          balance: nextBalance,
          creditAmount: nextBalance,
          status: nextStatus,
          paymentStatus: nextPaymentStatus,
          paymentMethod:
            cleanString(req.body?.paymentMethod) ?? cleanString(req.body?.method) ?? invoice.paymentMethod,
        },
      });

      if (customerId) {
        const balanceOwner = await tx.customer.findFirst({ where: { id: customerId, businessId }, select: { balance: true } });
        if (balanceOwner) {
          await tx.customer.update({
            where: { id: customerId },
            data: { balance: roundMoney(Math.max(0, Number(balanceOwner.balance || 0) - amount)) },
          });
        }
      }

      await writeAudit(tx, req, {
        businessId,
        userId: getUserId(req),
        action: "PAID",
        entityType: "sales_document",
        entityId: invoice.id,
        before: { paid: previousPaid, balance: currentBalance },
        after: { paid: nextPaid, balance: nextBalance, receiptNo },
      });

      return { payment, updatedInvoice, duplicate: false };
    });

    return res.status(result.duplicate ? 200 : 201).json({
      ok: true,
      duplicate: Boolean(result.duplicate),
      message: result.duplicate ? "Duplicate payment request ignored" : "Payment received successfully",
      data: {
        payment: formatPayment(result.payment),
        updatedInvoice: formatSalesDocument(result.updatedInvoice),
      },
    });
  } catch (error: any) {
    console.error("createPayment error:", error);

    return res.status(400).json({
      ok: false,
      error: {
        message: error?.message || "Failed to create payment",
      },
    });
  }
}
