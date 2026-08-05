import { createHash, randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import {
  AuditAction,
  PaymentDirection,
  PaymentMethodType,
  PaymentStatus,
  Prisma
} from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

function nonNegative(value: string, code: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || parsed.isNegative() || parsed.decimalPlaces() > 4) throw new Error(code);
  return parsed;
}

export async function postExpense(input: {
  context: TenantContext;
  idempotencyKey: string;
  branchId: string;
  paymentAccountId: string;
  methodType: PaymentMethodType;
  category: string;
  description: string;
  amount: string;
  taxAmount?: string;
  incurredAt: Date;
  reference?: string | null;
}) {
  requirePermission(input.context, "expenses.manage");
  if (!input.idempotencyKey || input.idempotencyKey.length > 160) throw new Error("INVALID_IDEMPOTENCY_KEY");
  if ([PaymentMethodType.CHEQUE, PaymentMethodType.CUSTOMER_CREDIT].includes(input.methodType)) {
    throw new Error("DEDICATED_PAYMENT_WORKFLOW_REQUIRED");
  }
  const amount = nonNegative(input.amount, "INVALID_EXPENSE_AMOUNT");
  const taxAmount = nonNegative(input.taxAmount ?? "0", "INVALID_EXPENSE_TAX");
  if (!amount.isPositive()) throw new Error("INVALID_EXPENSE_AMOUNT");
  if (taxAmount.greaterThan(amount)) throw new Error("EXPENSE_TAX_EXCEEDS_AMOUNT");

  const database = getDatabase();
  const requestHash = createHash("sha256").update(JSON.stringify({
    branchId: input.branchId,
    paymentAccountId: input.paymentAccountId,
    methodType: input.methodType,
    category: input.category.trim(),
    description: input.description.trim(),
    amount: amount.toFixed(4),
    taxAmount: taxAmount.toFixed(4),
    incurredAt: input.incurredAt.toISOString(),
    reference: input.reference ?? null
  })).digest("hex");
  const existing = await database.idempotencyRecord.findUnique({
    where: { businessId_key: { businessId: input.context.businessId, key: input.idempotencyKey } }
  });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
    if (existing.completedAt && existing.responseBody) return existing.responseBody;
    throw new Error("REQUEST_ALREADY_IN_PROGRESS");
  }
  await database.idempotencyRecord.create({
    data: {
      businessId: input.context.businessId,
      key: input.idempotencyKey,
      operation: "POST_GROCERY_EXPENSE",
      requestHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  try {
    const result = await database.$transaction(async (transaction) => {
      const [business, branch, account] = await Promise.all([
        transaction.business.findUnique({ where: { id: input.context.businessId } }),
        transaction.branch.findFirst({
          where: { id: input.branchId, businessId: input.context.businessId, active: true }
        }),
        transaction.paymentAccount.findFirst({
          where: {
            id: input.paymentAccountId,
            businessId: input.context.businessId,
            methodType: input.methodType,
            active: true,
            OR: [{ branchId: null }, { branchId: input.branchId }]
          }
        })
      ]);
      if (!business || !branch || !account) throw new Error("RESOURCE_NOT_FOUND");

      const expenseNumber = `EXP-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const expense = await transaction.expense.create({
        data: {
          businessId: input.context.businessId,
          branchId: input.branchId,
          paymentAccountId: input.paymentAccountId,
          createdById: input.context.userId,
          expenseNumber,
          category: input.category.trim(),
          description: input.description.trim(),
          amount: amount.toFixed(4),
          taxAmount: taxAmount.toFixed(4),
          incurredAt: input.incurredAt
        }
      });
      const payment = await transaction.paymentTransaction.create({
        data: {
          businessId: input.context.businessId,
          branchId: input.branchId,
          accountId: input.paymentAccountId,
          createdById: input.context.userId,
          methodType: input.methodType,
          direction: PaymentDirection.PAYMENT,
          status: PaymentStatus.POSTED,
          amount: amount.toFixed(4),
          currencyCode: business.currencyCode,
          reference: input.reference ?? expenseNumber,
          idempotencyKey: input.idempotencyKey
        }
      });
      await transaction.auditLog.create({
        data: {
          businessId: input.context.businessId,
          actorUserId: input.context.userId,
          action: AuditAction.POST,
          entityType: "EXPENSE",
          entityId: expense.id,
          afterData: {
            expenseNumber,
            category: expense.category,
            amount: expense.amount.toFixed(4),
            taxAmount: expense.taxAmount.toFixed(4),
            paymentTransactionId: payment.id,
            methodType: payment.methodType
          }
        }
      });
      return {
        id: expense.id,
        expenseNumber,
        category: expense.category,
        description: expense.description,
        amount: expense.amount.toFixed(4),
        taxAmount: expense.taxAmount.toFixed(4),
        methodType: payment.methodType,
        paymentTransactionId: payment.id,
        incurredAt: expense.incurredAt.toISOString()
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await database.idempotencyRecord.update({
      where: { businessId_key: { businessId: input.context.businessId, key: input.idempotencyKey } },
      data: { statusCode: 201, responseBody: result, completedAt: new Date() }
    });
    return result;
  } catch (error) {
    await database.idempotencyRecord.deleteMany({
      where: { businessId: input.context.businessId, key: input.idempotencyKey, completedAt: null }
    });
    throw error;
  }
}
