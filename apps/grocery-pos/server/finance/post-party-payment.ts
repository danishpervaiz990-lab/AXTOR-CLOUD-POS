import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import {
  AuditAction,
  LedgerDirection,
  PaymentDirection,
  PaymentMethodType,
  PaymentStatus,
  Prisma
} from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

export type PartyPaymentType = "CUSTOMER_RECEIPT" | "SUPPLIER_PAYMENT";

function paymentAmount(value: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || !parsed.isPositive() || parsed.decimalPlaces() > 4) {
    throw new Error("INVALID_PAYMENT_AMOUNT");
  }
  return parsed;
}

export async function postPartyPayment(input: {
  context: TenantContext;
  idempotencyKey: string;
  type: PartyPaymentType;
  partyId: string;
  branchId: string;
  accountId: string;
  methodType: PaymentMethodType;
  amount: string;
  reference?: string | null;
  description?: string | null;
}) {
  requirePermission(input.context, "payments.create");
  if (!input.idempotencyKey || input.idempotencyKey.length > 160) throw new Error("INVALID_IDEMPOTENCY_KEY");
  if (
    input.methodType === PaymentMethodType.CHEQUE ||
    input.methodType === PaymentMethodType.CUSTOMER_CREDIT
  ) {
    throw new Error("DEDICATED_PAYMENT_WORKFLOW_REQUIRED");
  }

  const amount = paymentAmount(input.amount);
  const requestHash = createHash("sha256").update(JSON.stringify({
    type: input.type,
    partyId: input.partyId,
    branchId: input.branchId,
    accountId: input.accountId,
    methodType: input.methodType,
    amount: amount.toFixed(4),
    reference: input.reference ?? null,
    description: input.description ?? null
  })).digest("hex");
  const database = getDatabase();

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
      operation: input.type,
      requestHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  try {
    const result = await database.$transaction(async (transaction) => {
      const [branch, account, business, party] = await Promise.all([
        transaction.branch.findFirst({
          where: { id: input.branchId, businessId: input.context.businessId, active: true }
        }),
        transaction.paymentAccount.findFirst({
          where: {
            id: input.accountId,
            businessId: input.context.businessId,
            active: true,
            OR: [{ branchId: null }, { branchId: input.branchId }]
          }
        }),
        transaction.business.findUnique({ where: { id: input.context.businessId } }),
        input.type === "CUSTOMER_RECEIPT"
          ? transaction.customer.findFirst({
              where: { id: input.partyId, businessId: input.context.businessId, active: true }
            })
          : transaction.supplier.findFirst({
              where: { id: input.partyId, businessId: input.context.businessId, active: true }
            })
      ]);
      if (!branch || !account || !business || !party) throw new Error("RESOURCE_NOT_FOUND");
      if (account.methodType !== input.methodType) throw new Error("PAYMENT_ACCOUNT_METHOD_MISMATCH");

      const direction = input.type === "CUSTOMER_RECEIPT"
        ? PaymentDirection.RECEIPT
        : PaymentDirection.PAYMENT;
      const ledgerDirection = input.type === "CUSTOMER_RECEIPT"
        ? LedgerDirection.CREDIT
        : LedgerDirection.DEBIT;
      const transactionRecord = await transaction.paymentTransaction.create({
        data: {
          businessId: input.context.businessId,
          branchId: input.branchId,
          accountId: input.accountId,
          createdById: input.context.userId,
          methodType: input.methodType,
          direction,
          status: PaymentStatus.POSTED,
          amount: amount.toFixed(4),
          currencyCode: business.currencyCode,
          reference: input.reference,
          idempotencyKey: input.idempotencyKey
        }
      });
      const ledger = await transaction.ledgerEntry.create({
        data: {
          businessId: input.context.businessId,
          customerId: input.type === "CUSTOMER_RECEIPT" ? input.partyId : null,
          supplierId: input.type === "SUPPLIER_PAYMENT" ? input.partyId : null,
          direction: ledgerDirection,
          amount: amount.toFixed(4),
          referenceType: input.type,
          referenceId: transactionRecord.id,
          description: input.description ?? (
            input.type === "CUSTOMER_RECEIPT" ? "Customer payment received" : "Supplier payment made"
          )
        }
      });
      await transaction.auditLog.create({
        data: {
          businessId: input.context.businessId,
          actorUserId: input.context.userId,
          action: AuditAction.POST,
          entityType: input.type,
          entityId: transactionRecord.id,
          afterData: {
            partyId: input.partyId,
            accountId: input.accountId,
            methodType: input.methodType,
            direction,
            amount: amount.toFixed(4),
            ledgerEntryId: ledger.id
          }
        }
      });
      return {
        id: transactionRecord.id,
        type: input.type,
        partyId: input.partyId,
        methodType: input.methodType,
        direction,
        status: transactionRecord.status,
        amount: transactionRecord.amount.toFixed(4),
        currencyCode: transactionRecord.currencyCode,
        postedAt: transactionRecord.postedAt.toISOString()
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
