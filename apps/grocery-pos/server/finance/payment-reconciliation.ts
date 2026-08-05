import Decimal from "decimal.js";
import {
  PaymentDirection,
  PaymentMethodType,
  PaymentStatus,
  Prisma
} from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

export type PaymentReconciliationFilters = {
  from: Date;
  to: Date;
  branchId?: string;
  accountId?: string;
  methodTypes?: PaymentMethodType[];
  direction?: PaymentDirection;
  includePending?: boolean;
  page?: number;
  pageSize?: number;
};

type PaymentBucket = {
  methodType: PaymentMethodType;
  direction: PaymentDirection;
  status: PaymentStatus;
  amount: Decimal;
  fees: Decimal;
  transactionCount: number;
};

function bucketKey(
  methodType: PaymentMethodType,
  direction: PaymentDirection,
  status: PaymentStatus
): string {
  return `${methodType}:${direction}:${status}`;
}

export async function getPaymentReconciliation(
  context: TenantContext,
  filters: PaymentReconciliationFilters
) {
  requirePermission(context, "reports.financial");
  if (filters.to < filters.from) throw new Error("INVALID_DATE_RANGE");

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 100, 500);
  const statusFilter: Prisma.EnumPaymentStatusFilter = filters.includePending
    ? { in: [PaymentStatus.POSTED, PaymentStatus.PENDING, PaymentStatus.REVERSED] }
    : { in: [PaymentStatus.POSTED, PaymentStatus.REVERSED] };

  const where: Prisma.PaymentTransactionWhereInput = {
    businessId: context.businessId,
    postedAt: { gte: filters.from, lte: filters.to },
    status: statusFilter,
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.methodTypes?.length ? { methodType: { in: filters.methodTypes } } : {}),
    ...(filters.direction ? { direction: filters.direction } : {})
  };

  const database = getDatabase();
  const [total, rows, allForSummary] = await database.$transaction([
    database.paymentTransaction.count({ where }),
    database.paymentTransaction.findMany({
      where,
      include: {
        account: { select: { id: true, code: true, name: true, methodType: true } },
        sale: { select: { id: true, invoiceNumber: true } },
        cheque: { select: { id: true, chequeNumber: true, status: true, dueDate: true } }
      },
      orderBy: [{ postedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    database.paymentTransaction.findMany({
      where,
      select: {
        methodType: true,
        direction: true,
        status: true,
        amount: true,
        feeAmount: true,
        saleId: true
      }
    })
  ]);

  const buckets = new Map<string, PaymentBucket>();
  let receipts = new Decimal(0);
  let payments = new Decimal(0);
  let pendingCheques = new Decimal(0);
  let reversals = new Decimal(0);
  const saleIds = new Set<string>();

  for (const transaction of allForSummary) {
    const key = bucketKey(transaction.methodType, transaction.direction, transaction.status);
    const bucket = buckets.get(key) ?? {
      methodType: transaction.methodType,
      direction: transaction.direction,
      status: transaction.status,
      amount: new Decimal(0),
      fees: new Decimal(0),
      transactionCount: 0
    };
    const transactionAmount = new Decimal(transaction.amount.toString());
    bucket.amount = bucket.amount.plus(transactionAmount);
    bucket.fees = bucket.fees.plus(transaction.feeAmount.toString());
    bucket.transactionCount += 1;
    buckets.set(key, bucket);

    if (transaction.saleId) saleIds.add(transaction.saleId);
    if (transaction.status === PaymentStatus.REVERSED) {
      reversals = reversals.plus(transactionAmount);
    } else if (
      transaction.methodType === PaymentMethodType.CHEQUE &&
      transaction.status === PaymentStatus.PENDING
    ) {
      pendingCheques = pendingCheques.plus(transactionAmount);
    } else if (transaction.status === PaymentStatus.POSTED) {
      if (transaction.direction === PaymentDirection.RECEIPT) receipts = receipts.plus(transactionAmount);
      if (transaction.direction === PaymentDirection.PAYMENT) payments = payments.plus(transactionAmount);
    }
  }

  return {
    filters: {
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
      branchId: filters.branchId ?? null,
      accountId: filters.accountId ?? null,
      methodTypes: filters.methodTypes ?? [],
      direction: filters.direction ?? null,
      includePending: Boolean(filters.includePending)
    },
    totals: {
      postedReceipts: receipts.toFixed(4),
      postedPayments: payments.toFixed(4),
      netPostedMovement: receipts.minus(payments).toFixed(4),
      pendingChequeReceipts: pendingCheques.toFixed(4),
      reversedAmount: reversals.toFixed(4),
      distinctSales: saleIds.size,
      paymentComponents: allForSummary.length
    },
    buckets: [...buckets.values()]
      .sort((left, right) => bucketKey(left.methodType, left.direction, left.status).localeCompare(
        bucketKey(right.methodType, right.direction, right.status)
      ))
      .map((bucket) => ({
        methodType: bucket.methodType,
        direction: bucket.direction,
        status: bucket.status,
        amount: bucket.amount.toFixed(4),
        fees: bucket.fees.toFixed(4),
        netAmount: bucket.amount.minus(bucket.fees).toFixed(4),
        transactionCount: bucket.transactionCount
      })),
    rows: rows.map((transaction) => ({
      id: transaction.id,
      postedAt: transaction.postedAt.toISOString(),
      methodType: transaction.methodType,
      direction: transaction.direction,
      status: transaction.status,
      amount: transaction.amount.toFixed(4),
      feeAmount: transaction.feeAmount.toFixed(4),
      currencyCode: transaction.currencyCode,
      reference: transaction.reference,
      account: transaction.account,
      sale: transaction.sale,
      cheque: transaction.cheque
        ? {
            ...transaction.cheque,
            dueDate: transaction.cheque.dueDate.toISOString()
          }
        : null
    })),
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize)
    }
  };
}
