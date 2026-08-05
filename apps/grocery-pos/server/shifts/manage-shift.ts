import Decimal from "decimal.js";
import {
  AuditAction,
  CashMovementType,
  PaymentDirection,
  PaymentMethodType,
  PaymentStatus,
  Prisma,
  ShiftStatus
} from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

function cash(value: string): Decimal {
  const result = new Decimal(value);
  if (!result.isFinite() || result.isNegative() || result.decimalPlaces() > 4) {
    throw new Error("INVALID_CASH_AMOUNT");
  }
  return result;
}

export async function openCashierShift(input: {
  context: TenantContext;
  branchId: string;
  registerId: string;
  openingCash: string;
}) {
  requirePermission(input.context, "shifts.open");
  const openingCash = cash(input.openingCash);
  const database = getDatabase();

  return database.$transaction(async (transaction) => {
    const register = await transaction.register.findFirst({
      where: {
        id: input.registerId,
        businessId: input.context.businessId,
        branchId: input.branchId,
        active: true
      }
    });
    if (!register) throw new Error("RESOURCE_NOT_FOUND");

    const existing = await transaction.cashierShift.findFirst({
      where: {
        businessId: input.context.businessId,
        registerId: input.registerId,
        status: { in: [ShiftStatus.OPEN, ShiftStatus.REOPENED] }
      }
    });
    if (existing) throw new Error("REGISTER_ALREADY_HAS_OPEN_SHIFT");

    const shift = await transaction.cashierShift.create({
      data: {
        businessId: input.context.businessId,
        branchId: input.branchId,
        registerId: input.registerId,
        cashierId: input.context.userId,
        status: ShiftStatus.OPEN,
        openingCash: openingCash.toFixed(4),
        expectedCash: openingCash.toFixed(4)
      }
    });

    if (openingCash.isPositive()) {
      await transaction.cashMovement.create({
        data: {
          businessId: input.context.businessId,
          shiftId: shift.id,
          createdById: input.context.userId,
          type: CashMovementType.OPENING,
          amount: openingCash.toFixed(4),
          reason: "Opening cash"
        }
      });
    }

    await transaction.auditLog.create({
      data: {
        businessId: input.context.businessId,
        actorUserId: input.context.userId,
        action: AuditAction.CREATE,
        entityType: "CASHIER_SHIFT",
        entityId: shift.id,
        afterData: {
          branchId: input.branchId,
          registerId: input.registerId,
          openingCash: openingCash.toFixed(4),
          status: shift.status
        }
      }
    });

    return {
      id: shift.id,
      status: shift.status,
      openedAt: shift.openedAt.toISOString(),
      openingCash: shift.openingCash.toFixed(4)
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function addCashMovement(input: {
  context: TenantContext;
  shiftId: string;
  type: CashMovementType;
  amount: string;
  reason: string;
}) {
  requirePermission(input.context, "shifts.close");
  if (input.type === CashMovementType.OPENING) throw new Error("OPENING_MOVEMENT_NOT_ALLOWED");
  const movementAmount = cash(input.amount);
  if (movementAmount.isZero()) throw new Error("INVALID_CASH_AMOUNT");

  return getDatabase().$transaction(async (transaction) => {
    const shift = await transaction.cashierShift.findFirst({
      where: {
        id: input.shiftId,
        businessId: input.context.businessId,
        status: { in: [ShiftStatus.OPEN, ShiftStatus.REOPENED] }
      }
    });
    if (!shift) throw new Error("OPEN_SHIFT_NOT_FOUND");

    const movement = await transaction.cashMovement.create({
      data: {
        businessId: input.context.businessId,
        shiftId: shift.id,
        createdById: input.context.userId,
        type: input.type,
        amount: movementAmount.toFixed(4),
        reason: input.reason
      }
    });
    await transaction.auditLog.create({
      data: {
        businessId: input.context.businessId,
        actorUserId: input.context.userId,
        action: AuditAction.POST,
        entityType: "CASH_MOVEMENT",
        entityId: movement.id,
        afterData: {
          shiftId: shift.id,
          type: movement.type,
          amount: movement.amount.toFixed(4),
          reason: movement.reason
        }
      }
    });
    return {
      id: movement.id,
      shiftId: movement.shiftId,
      type: movement.type,
      amount: movement.amount.toFixed(4),
      reason: movement.reason,
      createdAt: movement.createdAt.toISOString()
    };
  });
}

export async function closeCashierShift(input: {
  context: TenantContext;
  shiftId: string;
  actualCash: string;
}) {
  requirePermission(input.context, "shifts.close");
  const actualCash = cash(input.actualCash);
  const database = getDatabase();

  return database.$transaction(async (transaction) => {
    const shift = await transaction.cashierShift.findFirst({
      where: {
        id: input.shiftId,
        businessId: input.context.businessId,
        status: { in: [ShiftStatus.OPEN, ShiftStatus.REOPENED] }
      }
    });
    if (!shift) throw new Error("OPEN_SHIFT_NOT_FOUND");
    if (shift.cashierId !== input.context.userId && input.context.role === "CASHIER") {
      throw new Error("PERMISSION_DENIED");
    }

    const [payments, movements] = await Promise.all([
      transaction.paymentTransaction.findMany({
        where: {
          businessId: input.context.businessId,
          shiftId: shift.id,
          methodType: PaymentMethodType.CASH,
          status: PaymentStatus.POSTED
        },
        select: { direction: true, amount: true }
      }),
      transaction.cashMovement.findMany({
        where: {
          businessId: input.context.businessId,
          shiftId: shift.id,
          type: { not: CashMovementType.OPENING }
        },
        select: { type: true, amount: true }
      })
    ]);

    let expectedCash = new Decimal(shift.openingCash.toString());
    for (const payment of payments) {
      const value = new Decimal(payment.amount.toString());
      expectedCash = payment.direction === PaymentDirection.RECEIPT
        ? expectedCash.plus(value)
        : expectedCash.minus(value);
    }
    for (const movement of movements) {
      const value = new Decimal(movement.amount.toString());
      if (movement.type === CashMovementType.CASH_IN) expectedCash = expectedCash.plus(value);
      if ([
        CashMovementType.CASH_OUT,
        CashMovementType.DROP,
        CashMovementType.WITHDRAWAL,
        CashMovementType.REFUND
      ].includes(movement.type)) {
        expectedCash = expectedCash.minus(value);
      }
      if (movement.type === CashMovementType.CLOSING_ADJUSTMENT) {
        expectedCash = expectedCash.plus(value);
      }
    }

    const variance = actualCash.minus(expectedCash);
    const update = await transaction.cashierShift.updateMany({
      where: {
        id: shift.id,
        businessId: input.context.businessId,
        status: shift.status,
        updatedAt: shift.updatedAt
      },
      data: {
        status: ShiftStatus.CLOSED,
        expectedCash: expectedCash.toFixed(4),
        actualCash: actualCash.toFixed(4),
        variance: variance.toFixed(4),
        closedAt: new Date()
      }
    });
    if (update.count !== 1) throw new Error("CONCURRENT_SHIFT_MODIFICATION");

    await transaction.auditLog.create({
      data: {
        businessId: input.context.businessId,
        actorUserId: input.context.userId,
        action: AuditAction.UPDATE,
        entityType: "CASHIER_SHIFT",
        entityId: shift.id,
        beforeData: { status: shift.status },
        afterData: {
          status: ShiftStatus.CLOSED,
          expectedCash: expectedCash.toFixed(4),
          actualCash: actualCash.toFixed(4),
          variance: variance.toFixed(4)
        }
      }
    });

    return {
      id: shift.id,
      status: ShiftStatus.CLOSED,
      expectedCash: expectedCash.toFixed(4),
      actualCash: actualCash.toFixed(4),
      variance: variance.toFixed(4)
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
