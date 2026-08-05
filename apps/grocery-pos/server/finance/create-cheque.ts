import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import {
  AuditAction,
  ChequeDirection,
  ChequeStatus,
  PaymentDirection,
  PaymentMethodType,
  PaymentStatus,
  Prisma
} from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

export type ChequeAllocationInput = {
  referenceType: string;
  referenceId: string;
  amount: string;
};

function positiveAmount(value: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite() || !parsed.isPositive() || parsed.decimalPlaces() > 4) {
    throw new Error("INVALID_CHEQUE_AMOUNT");
  }
  return parsed;
}

function initialStatus(direction: ChequeDirection, dueDate: Date, now: Date): ChequeStatus {
  const dueDay = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (dueDay > nowDay) return ChequeStatus.POST_DATED;
  if (dueDay === nowDay) return ChequeStatus.DUE_TODAY;
  return direction === ChequeDirection.INWARD ? ChequeStatus.RECEIVED : ChequeStatus.ISSUED;
}

export async function createCheque(input: {
  context: TenantContext;
  idempotencyKey: string;
  direction: ChequeDirection;
  branchId?: string | null;
  paymentAccountId: string;
  customerId?: string | null;
  supplierId?: string | null;
  chequeNumber: string;
  bankName: string;
  bankBranch?: string | null;
  maskedAccount?: string | null;
  drawerOrIssuer?: string | null;
  payeeOrBeneficiary?: string | null;
  amount: string;
  chequeDate: Date;
  dueDate: Date;
  notes?: string | null;
  allocations?: ChequeAllocationInput[];
}) {
  requirePermission(
    input.context,
    input.direction === ChequeDirection.INWARD ? "cheques.create_inward" : "cheques.create_outward"
  );
  if (!input.idempotencyKey || input.idempotencyKey.length > 160) throw new Error("INVALID_IDEMPOTENCY_KEY");
  if (input.direction === ChequeDirection.INWARD && input.supplierId) throw new Error("INWARD_CHEQUE_CANNOT_USE_SUPPLIER");
  if (input.direction === ChequeDirection.OUTWARD && input.customerId) throw new Error("OUTWARD_CHEQUE_CANNOT_USE_CUSTOMER");

  const amount = positiveAmount(input.amount);
  const allocations = input.allocations ?? [];
  if (allocations.length > 100) throw new Error("TOO_MANY_CHEQUE_ALLOCATIONS");
  const allocationAmounts = allocations.map((allocation) => positiveAmount(allocation.amount));
  const allocationTotal = allocationAmounts.reduce((total, value) => total.plus(value), new Decimal(0));
  if (allocationTotal.greaterThan(amount)) throw new Error("CHEQUE_OVER_ALLOCATED");
  if (new Set(allocations.map((allocation) => `${allocation.referenceType}:${allocation.referenceId}`)).size !== allocations.length) {
    throw new Error("DUPLICATE_CHEQUE_ALLOCATION");
  }

  const requestHash = createHash("sha256").update(JSON.stringify({
    direction: input.direction,
    branchId: input.branchId ?? null,
    paymentAccountId: input.paymentAccountId,
    customerId: input.customerId ?? null,
    supplierId: input.supplierId ?? null,
    chequeNumber: input.chequeNumber,
    bankName: input.bankName,
    bankBranch: input.bankBranch ?? null,
    maskedAccount: input.maskedAccount ?? null,
    amount: amount.toFixed(4),
    chequeDate: input.chequeDate.toISOString(),
    dueDate: input.dueDate.toISOString(),
    allocations
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
      operation: input.direction === ChequeDirection.INWARD ? "CREATE_INWARD_CHEQUE" : "CREATE_OUTWARD_CHEQUE",
      requestHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  try {
    const result = await database.$transaction(async (transaction) => {
      const [business, branch, account, customer, supplier] = await Promise.all([
        transaction.business.findUnique({ where: { id: input.context.businessId } }),
        input.branchId
          ? transaction.branch.findFirst({ where: { id: input.branchId, businessId: input.context.businessId, active: true } })
          : Promise.resolve(null),
        transaction.paymentAccount.findFirst({
          where: {
            id: input.paymentAccountId,
            businessId: input.context.businessId,
            methodType: PaymentMethodType.CHEQUE,
            active: true,
            ...(input.branchId ? { OR: [{ branchId: null }, { branchId: input.branchId }] } : {})
          }
        }),
        input.customerId
          ? transaction.customer.findFirst({ where: { id: input.customerId, businessId: input.context.businessId, active: true } })
          : Promise.resolve(null),
        input.supplierId
          ? transaction.supplier.findFirst({ where: { id: input.supplierId, businessId: input.context.businessId, active: true } })
          : Promise.resolve(null)
      ]);
      if (!business || !account || (input.branchId && !branch) || (input.customerId && !customer) || (input.supplierId && !supplier)) {
        throw new Error("RESOURCE_NOT_FOUND");
      }

      const now = new Date();
      const status = initialStatus(input.direction, input.dueDate, now);
      const payment = await transaction.paymentTransaction.create({
        data: {
          businessId: input.context.businessId,
          branchId: input.branchId,
          accountId: input.paymentAccountId,
          createdById: input.context.userId,
          methodType: PaymentMethodType.CHEQUE,
          direction: input.direction === ChequeDirection.INWARD ? PaymentDirection.RECEIPT : PaymentDirection.PAYMENT,
          status: PaymentStatus.PENDING,
          amount: amount.toFixed(4),
          currencyCode: business.currencyCode,
          reference: input.chequeNumber,
          idempotencyKey: input.idempotencyKey
        }
      });
      const cheque = await transaction.cheque.create({
        data: {
          businessId: input.context.businessId,
          branchId: input.branchId,
          paymentAccountId: input.paymentAccountId,
          paymentTransactionId: payment.id,
          customerId: input.customerId,
          supplierId: input.supplierId,
          createdById: input.context.userId,
          direction: input.direction,
          status,
          chequeNumber: input.chequeNumber,
          bankName: input.bankName,
          bankBranch: input.bankBranch,
          maskedAccount: input.maskedAccount,
          drawerOrIssuer: input.drawerOrIssuer,
          payeeOrBeneficiary: input.payeeOrBeneficiary,
          amount: amount.toFixed(4),
          currencyCode: business.currencyCode,
          chequeDate: input.chequeDate,
          receivedOrIssuedAt: now,
          dueDate: input.dueDate,
          notes: input.notes,
          allocations: {
            create: allocations.map((allocation, index) => ({
              businessId: input.context.businessId,
              referenceType: allocation.referenceType,
              referenceId: allocation.referenceId,
              amount: allocationAmounts[index]!.toFixed(4)
            }))
          }
        }
      });
      await transaction.chequeStatusHistory.create({
        data: {
          businessId: input.context.businessId,
          chequeId: cheque.id,
          fromStatus: null,
          toStatus: status,
          actorUserId: input.context.userId,
          reason: "Cheque recorded"
        }
      });
      await transaction.auditLog.create({
        data: {
          businessId: input.context.businessId,
          actorUserId: input.context.userId,
          action: AuditAction.CREATE,
          entityType: "CHEQUE",
          entityId: cheque.id,
          afterData: {
            direction: cheque.direction,
            status: cheque.status,
            chequeNumber: cheque.chequeNumber,
            bankName: cheque.bankName,
            amount: cheque.amount.toFixed(4),
            dueDate: cheque.dueDate.toISOString(),
            allocationTotal: allocationTotal.toFixed(4)
          }
        }
      });
      return {
        id: cheque.id,
        paymentTransactionId: payment.id,
        direction: cheque.direction,
        status: cheque.status,
        chequeNumber: cheque.chequeNumber,
        amount: cheque.amount.toFixed(4),
        allocatedAmount: allocationTotal.toFixed(4),
        unallocatedAmount: amount.minus(allocationTotal).toFixed(4),
        currencyCode: cheque.currencyCode,
        dueDate: cheque.dueDate.toISOString()
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
