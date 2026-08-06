import Decimal from "decimal.js";
import { ChequeDirection, ChequeStatus, Prisma } from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { daysUntilChequeDue } from "@/server/finance/cheque-status";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

export type ChequeReportFilters = {
  fromDueDate?: Date;
  toDueDate?: Date;
  direction?: ChequeDirection;
  statuses?: ChequeStatus[];
  branchId?: string;
  paymentAccountId?: string;
  customerId?: string;
  supplierId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

type ChequeBucket = {
  direction: ChequeDirection;
  status: ChequeStatus;
  amount: Decimal;
  count: number;
};

const clearedOrClosed = new Set<ChequeStatus>([
  ChequeStatus.CLEARED,
  ChequeStatus.CANCELLED,
  ChequeStatus.REPLACED,
  ChequeStatus.RETURNED
]);

export async function getChequeReport(context: TenantContext, filters: ChequeReportFilters) {
  requirePermission(context, "cheques.view");
  if (filters.fromDueDate && filters.toDueDate && filters.toDueDate < filters.fromDueDate) {
    throw new Error("INVALID_DATE_RANGE");
  }

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 100, 500);
  const where: Prisma.ChequeWhereInput = {
    businessId: context.businessId,
    ...(filters.direction ? { direction: filters.direction } : {}),
    ...(filters.statuses?.length ? { status: { in: filters.statuses } } : {}),
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(filters.paymentAccountId ? { paymentAccountId: filters.paymentAccountId } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.fromDueDate || filters.toDueDate
      ? {
          dueDate: {
            ...(filters.fromDueDate ? { gte: filters.fromDueDate } : {}),
            ...(filters.toDueDate ? { lte: filters.toDueDate } : {})
          }
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { chequeNumber: { contains: filters.search, mode: "insensitive" } },
            { bankName: { contains: filters.search, mode: "insensitive" } },
            { drawerOrIssuer: { contains: filters.search, mode: "insensitive" } },
            { payeeOrBeneficiary: { contains: filters.search, mode: "insensitive" } }
          ]
        }
      : {})
  };

  const database = getDatabase();
  const [total, rows, summaryRows] = await database.$transaction([
    database.cheque.count({ where }),
    database.cheque.findMany({
      where,
      include: {
        paymentAccount: { select: { id: true, code: true, name: true } },
        customer: { select: { id: true, code: true, name: true } },
        supplier: { select: { id: true, code: true, name: true } },
        allocations: { select: { id: true, referenceType: true, referenceId: true, amount: true } }
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    database.cheque.findMany({
      where,
      select: { direction: true, status: true, amount: true, dueDate: true }
    })
  ]);

  const buckets = new Map<string, ChequeBucket>();
  let inwardTotal = new Decimal(0);
  let outwardTotal = new Decimal(0);
  let dueSoonTotal = new Decimal(0);
  let overdueTotal = new Decimal(0);
  let clearedTotal = new Decimal(0);
  let bouncedTotal = new Decimal(0);
  const now = new Date();

  for (const cheque of summaryRows) {
    const chequeAmount = new Decimal(cheque.amount.toString());
    const key = `${cheque.direction}:${cheque.status}`;
    const bucket = buckets.get(key) ?? {
      direction: cheque.direction,
      status: cheque.status,
      amount: new Decimal(0),
      count: 0
    };
    bucket.amount = bucket.amount.plus(chequeAmount);
    bucket.count += 1;
    buckets.set(key, bucket);

    if (cheque.direction === ChequeDirection.INWARD) inwardTotal = inwardTotal.plus(chequeAmount);
    if (cheque.direction === ChequeDirection.OUTWARD) outwardTotal = outwardTotal.plus(chequeAmount);
    if (cheque.status === ChequeStatus.CLEARED) clearedTotal = clearedTotal.plus(chequeAmount);
    if (cheque.status === ChequeStatus.BOUNCED) bouncedTotal = bouncedTotal.plus(chequeAmount);

    const days = daysUntilChequeDue(cheque.dueDate, now);
    if (!clearedOrClosed.has(cheque.status) && days >= 0 && days <= 30) {
      dueSoonTotal = dueSoonTotal.plus(chequeAmount);
    }
    if (!clearedOrClosed.has(cheque.status) && days < 0) {
      overdueTotal = overdueTotal.plus(chequeAmount);
    }
  }

  return {
    generatedAt: now.toISOString(),
    totals: {
      inward: inwardTotal.toFixed(4),
      outward: outwardTotal.toFixed(4),
      netDirection: inwardTotal.minus(outwardTotal).toFixed(4),
      dueWithin30Days: dueSoonTotal.toFixed(4),
      overdue: overdueTotal.toFixed(4),
      cleared: clearedTotal.toFixed(4),
      bounced: bouncedTotal.toFixed(4),
      chequeCount: summaryRows.length
    },
    tally: [...buckets.values()]
      .sort((left, right) => `${left.direction}:${left.status}`.localeCompare(`${right.direction}:${right.status}`))
      .map((bucket) => ({
        direction: bucket.direction,
        status: bucket.status,
        amount: bucket.amount.toFixed(4),
        count: bucket.count
      })),
    rows: rows.map((cheque) => {
      const allocated = cheque.allocations.reduce(
        (totalAmount, allocation) => totalAmount.plus(allocation.amount.toString()),
        new Decimal(0)
      );
      return {
        id: cheque.id,
        direction: cheque.direction,
        status: cheque.status,
        chequeNumber: cheque.chequeNumber,
        bankName: cheque.bankName,
        bankBranch: cheque.bankBranch,
        maskedAccount: cheque.maskedAccount,
        drawerOrIssuer: cheque.drawerOrIssuer,
        payeeOrBeneficiary: cheque.payeeOrBeneficiary,
        amount: cheque.amount.toFixed(4),
        allocatedAmount: allocated.toFixed(4),
        unallocatedAmount: new Decimal(cheque.amount.toString()).minus(allocated).toFixed(4),
        currencyCode: cheque.currencyCode,
        chequeDate: cheque.chequeDate.toISOString(),
        dueDate: cheque.dueDate.toISOString(),
        daysUntilDue: daysUntilChequeDue(cheque.dueDate, now),
        depositDate: cheque.depositDate?.toISOString() ?? null,
        clearingDate: cheque.clearingDate?.toISOString() ?? null,
        bounceOrReturnDate: cheque.bounceOrReturnDate?.toISOString() ?? null,
        cancellationDate: cheque.cancellationDate?.toISOString() ?? null,
        paymentAccount: cheque.paymentAccount,
        customer: cheque.customer,
        supplier: cheque.supplier,
        allocations: cheque.allocations.map((allocation) => ({
          ...allocation,
          amount: allocation.amount.toFixed(4)
        }))
      };
    }),
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize)
    }
  };
}
