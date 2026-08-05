import {
  AuditAction,
  ChequeDirection,
  ChequeStatus,
  LedgerDirection,
  PaymentStatus
} from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { assertChequeTransition, type ChequeStatusValue } from "@/server/finance/cheque-status";
import { requirePermission, type Permission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

const permissionByTargetStatus: Partial<Record<ChequeStatusValue, Permission>> = {
  DEPOSITED: "cheques.deposit",
  SUBMITTED_FOR_CLEARING: "cheques.submit",
  CLEARED: "cheques.clear",
  BOUNCED: "cheques.bounce",
  RETURNED: "cheques.return",
  STOPPED: "cheques.stop",
  CANCELLED: "cheques.cancel",
  REPLACED: "cheques.replace"
};

const failedPaymentStatuses: ReadonlySet<ChequeStatusValue> = new Set([
  "BOUNCED",
  "RETURNED",
  "STOPPED",
  "CANCELLED"
]);

function auditActionForStatus(status: ChequeStatusValue): AuditAction {
  switch (status) {
    case "CLEARED":
      return AuditAction.CLEAR;
    case "BOUNCED":
      return AuditAction.BOUNCE;
    case "RETURNED":
      return AuditAction.RETURN;
    case "CANCELLED":
    case "STOPPED":
      return AuditAction.CANCEL;
    default:
      return AuditAction.UPDATE;
  }
}

function transitionDates(status: ChequeStatusValue, occurredAt: Date) {
  switch (status) {
    case "DEPOSITED":
      return { depositDate: occurredAt };
    case "CLEARED":
      return { clearingDate: occurredAt };
    case "BOUNCED":
    case "RETURNED":
      return { bounceOrReturnDate: occurredAt };
    case "CANCELLED":
      return { cancellationDate: occurredAt };
    default:
      return {};
  }
}

export async function transitionCheque(input: {
  context: TenantContext;
  chequeId: string;
  toStatus: ChequeStatusValue;
  reason?: string;
  occurredAt?: Date;
}) {
  const requiredPermission = permissionByTargetStatus[input.toStatus];
  if (requiredPermission) {
    requirePermission(input.context, requiredPermission);
  }

  const occurredAt = input.occurredAt ?? new Date();
  const database = getDatabase();

  return database.$transaction(async (transaction) => {
    const cheque = await transaction.cheque.findFirst({
      where: {
        id: input.chequeId,
        businessId: input.context.businessId
      }
    });

    if (!cheque) {
      throw new Error("RESOURCE_NOT_FOUND");
    }

    const fromStatus = cheque.status as ChequeStatusValue;
    assertChequeTransition(fromStatus, input.toStatus);

    const updateResult = await transaction.cheque.updateMany({
      where: {
        id: cheque.id,
        businessId: input.context.businessId,
        version: cheque.version
      },
      data: {
        status: input.toStatus as ChequeStatus,
        version: { increment: 1 },
        ...transitionDates(input.toStatus, occurredAt)
      }
    });

    if (updateResult.count !== 1) {
      throw new Error("CONCURRENT_MODIFICATION");
    }

    let paymentStatus: PaymentStatus | null = null;
    let ledgerEntryId: string | null = null;

    if (cheque.paymentTransactionId && input.toStatus === "CLEARED") {
      const paymentUpdate = await transaction.paymentTransaction.updateMany({
        where: {
          id: cheque.paymentTransactionId,
          businessId: input.context.businessId,
          status: PaymentStatus.PENDING
        },
        data: {
          status: PaymentStatus.POSTED,
          postedAt: occurredAt,
          reversedAt: null,
          reversalReason: null
        }
      });
      if (paymentUpdate.count !== 1) {
        throw new Error("CHEQUE_PAYMENT_STATE_CONFLICT");
      }
      paymentStatus = PaymentStatus.POSTED;

      if (cheque.direction === ChequeDirection.INWARD && cheque.customerId) {
        const ledger = await transaction.ledgerEntry.create({
          data: {
            businessId: input.context.businessId,
            customerId: cheque.customerId,
            direction: LedgerDirection.CREDIT,
            amount: cheque.amount,
            referenceType: "CHEQUE_CLEARING",
            referenceId: cheque.id,
            description: `Inward cheque ${cheque.chequeNumber} cleared`
          }
        });
        ledgerEntryId = ledger.id;
      }

      if (cheque.direction === ChequeDirection.OUTWARD && cheque.supplierId) {
        const ledger = await transaction.ledgerEntry.create({
          data: {
            businessId: input.context.businessId,
            supplierId: cheque.supplierId,
            direction: LedgerDirection.DEBIT,
            amount: cheque.amount,
            referenceType: "CHEQUE_CLEARING",
            referenceId: cheque.id,
            description: `Outward cheque ${cheque.chequeNumber} cleared`
          }
        });
        ledgerEntryId = ledger.id;
      }
    }

    if (cheque.paymentTransactionId && failedPaymentStatuses.has(input.toStatus)) {
      const paymentUpdate = await transaction.paymentTransaction.updateMany({
        where: {
          id: cheque.paymentTransactionId,
          businessId: input.context.businessId,
          status: PaymentStatus.PENDING
        },
        data: {
          status: PaymentStatus.FAILED,
          reversedAt: occurredAt,
          reversalReason: input.reason ?? `Cheque marked ${input.toStatus.toLowerCase()}`
        }
      });
      if (paymentUpdate.count !== 1) {
        throw new Error("CHEQUE_PAYMENT_STATE_CONFLICT");
      }
      paymentStatus = PaymentStatus.FAILED;
    }

    await transaction.chequeStatusHistory.create({
      data: {
        businessId: input.context.businessId,
        chequeId: cheque.id,
        fromStatus: cheque.status,
        toStatus: input.toStatus as ChequeStatus,
        actorUserId: input.context.userId,
        reason: input.reason,
        occurredAt
      }
    });

    await transaction.auditLog.create({
      data: {
        businessId: input.context.businessId,
        actorUserId: input.context.userId,
        action: auditActionForStatus(input.toStatus),
        entityType: "CHEQUE",
        entityId: cheque.id,
        beforeData: {
          status: fromStatus,
          version: cheque.version,
          paymentStatus: cheque.paymentTransactionId ? PaymentStatus.PENDING : null
        },
        afterData: {
          status: input.toStatus,
          version: cheque.version + 1,
          paymentStatus,
          ledgerEntryId
        },
        metadata: input.reason ? { reason: input.reason } : undefined
      }
    });

    return transaction.cheque.findFirstOrThrow({
      where: { id: cheque.id, businessId: input.context.businessId }
    });
  });
}
