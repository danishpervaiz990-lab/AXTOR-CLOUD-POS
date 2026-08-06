import Decimal from "decimal.js";
import { LedgerDirection, Prisma } from "@prisma/client";
import { getDatabase } from "@/lib/db";
import { requirePermission } from "@/server/permissions/permissions";
import type { TenantContext } from "@/server/tenancy/context";

export type LedgerStatementParty = "CUSTOMER" | "SUPPLIER";

export type LedgerStatementFilters = {
  party: LedgerStatementParty;
  partyId: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export function applyLedgerEntry(
  currentBalance: Decimal,
  party: LedgerStatementParty,
  direction: LedgerDirection,
  amount: Decimal
): Decimal {
  if (party === "CUSTOMER") {
    return direction === LedgerDirection.DEBIT
      ? currentBalance.plus(amount)
      : currentBalance.minus(amount);
  }
  return direction === LedgerDirection.CREDIT
    ? currentBalance.plus(amount)
    : currentBalance.minus(amount);
}

export async function getLedgerStatement(
  context: TenantContext,
  filters: LedgerStatementFilters
) {
  requirePermission(context, filters.party === "CUSTOMER" ? "customer_credit.view" : "suppliers.view");
  if (filters.from && filters.to && filters.to < filters.from) throw new Error("INVALID_DATE_RANGE");

  const database = getDatabase();
  const partyRecord = filters.party === "CUSTOMER"
    ? await database.customer.findFirst({
        where: { id: filters.partyId, businessId: context.businessId },
        select: { id: true, code: true, name: true }
      })
    : await database.supplier.findFirst({
        where: { id: filters.partyId, businessId: context.businessId },
        select: { id: true, code: true, name: true }
      });
  if (!partyRecord) throw new Error("RESOURCE_NOT_FOUND");

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 100, 500);
  const partyWhere = filters.party === "CUSTOMER"
    ? { customerId: filters.partyId }
    : { supplierId: filters.partyId };
  const where: Prisma.LedgerEntryWhereInput = {
    businessId: context.businessId,
    ...partyWhere,
    ...(filters.from || filters.to ? {
      occurredAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {})
      }
    } : {})
  };
  const openingWhere: Prisma.LedgerEntryWhereInput = {
    businessId: context.businessId,
    ...partyWhere,
    ...(filters.from ? { occurredAt: { lt: filters.from } } : { id: "__NO_OPENING_RANGE__" })
  };

  const [total, rows, openingRows, allPeriodRows] = await database.$transaction([
    database.ledgerEntry.count({ where }),
    database.ledgerEntry.findMany({
      where,
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    filters.from
      ? database.ledgerEntry.findMany({
          where: openingWhere,
          select: { direction: true, amount: true }
        })
      : database.ledgerEntry.findMany({ where: { id: "__NO_OPENING_RANGE__" }, select: { direction: true, amount: true } }),
    database.ledgerEntry.findMany({
      where,
      select: { direction: true, amount: true }
    })
  ]);

  let openingBalance = new Decimal(0);
  for (const entry of openingRows) {
    openingBalance = applyLedgerEntry(openingBalance, filters.party, entry.direction, new Decimal(entry.amount.toString()));
  }

  let periodDebits = new Decimal(0);
  let periodCredits = new Decimal(0);
  let closingBalance = openingBalance;
  for (const entry of allPeriodRows) {
    const value = new Decimal(entry.amount.toString());
    if (entry.direction === LedgerDirection.DEBIT) periodDebits = periodDebits.plus(value);
    if (entry.direction === LedgerDirection.CREDIT) periodCredits = periodCredits.plus(value);
    closingBalance = applyLedgerEntry(closingBalance, filters.party, entry.direction, value);
  }

  let runningBalance = openingBalance;
  const statementRows = rows.map((entry) => {
    runningBalance = applyLedgerEntry(runningBalance, filters.party, entry.direction, new Decimal(entry.amount.toString()));
    return {
      id: entry.id,
      occurredAt: entry.occurredAt.toISOString(),
      direction: entry.direction,
      amount: entry.amount.toFixed(4),
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      description: entry.description,
      runningBalance: runningBalance.toFixed(4)
    };
  });

  return {
    party: { type: filters.party, ...partyRecord },
    totals: {
      openingBalance: openingBalance.toFixed(4),
      periodDebits: periodDebits.toFixed(4),
      periodCredits: periodCredits.toFixed(4),
      closingBalance: closingBalance.toFixed(4)
    },
    rows: statementRows,
    pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) }
  };
}
