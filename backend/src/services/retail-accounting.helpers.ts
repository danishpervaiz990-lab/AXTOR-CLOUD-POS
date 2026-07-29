export type PaymentBreakdown = {
  cash: number;
  card: number;
  bank: number;
  other: number;
  initialPaid: number;
  credit: number;
};

export function jsonRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function classify(methodValue: unknown, amount: number, totals: PaymentBreakdown) {
  const method = String(methodValue || "cash").toLowerCase();
  if (method.includes("cash")) totals.cash += amount;
  else if (method.includes("card")) totals.card += amount;
  else if (method.includes("bank")) totals.bank += amount;
  else totals.other += amount;
}

export function initialPaymentBreakdown(document: any): PaymentBreakdown {
  const total = Number(document?.total || 0);
  const metadata = jsonRecord(document?.metadata);
  const lines = Array.isArray(metadata.paymentLines) ? metadata.paymentLines : [];
  const result: PaymentBreakdown = { cash: 0, card: 0, bank: 0, other: 0, initialPaid: 0, credit: 0 };

  if (lines.length) {
    for (const line of lines) {
      const amount = Math.max(0, Number(line?.amount || 0));
      result.initialPaid += amount;
      classify(line?.method, amount, result);
    }
  } else {
    const paid = Math.max(0, Math.min(total, Number(document?.paid || 0)));
    result.initialPaid = paid;
    classify(document?.paymentMethod, paid, result);
  }

  result.initialPaid = Math.min(total, result.initialPaid);
  result.credit = Math.max(0, total - result.initialPaid);
  return result;
}

export function transactionBelongsToShift(record: any, shiftId: string, expectedSource: string): boolean {
  const metadata = jsonRecord(record?.allocation ?? record?.metadata);
  const source = String(metadata.source || "").toLowerCase();
  return String(metadata.shiftId || "") === String(shiftId) && source === expectedSource.toLowerCase();
}

export function profitLossAfterReturns(input: {
  grossRevenue: number;
  grossCogs: number;
  returnedRevenue: number;
  returnedCogs: number;
  expenses: number;
}) {
  const revenue = input.grossRevenue - input.returnedRevenue;
  const cogs = input.grossCogs - input.returnedCogs;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - input.expenses;
  return { revenue, cogs, grossProfit, netProfit };
}
