import Decimal from "decimal.js";

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 40
});

export type MoneyInput = Decimal.Value;

export function money(value: MoneyInput): Decimal {
  const amount = new Decimal(value);
  if (!amount.isFinite()) {
    throw new Error("Money amount must be finite");
  }
  return amount;
}

export function quantizeMoney(value: MoneyInput, decimalPlaces = 2): Decimal {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 6) {
    throw new Error("Money decimal places must be an integer from 0 to 6");
  }
  return money(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

export function addMoney(values: readonly MoneyInput[], decimalPlaces = 2): Decimal {
  return quantizeMoney(values.reduce<Decimal>((total, value) => total.plus(money(value)), new Decimal(0)), decimalPlaces);
}

export function subtractMoney(minuend: MoneyInput, subtrahend: MoneyInput, decimalPlaces = 2): Decimal {
  return quantizeMoney(money(minuend).minus(money(subtrahend)), decimalPlaces);
}

export function multiplyMoney(amount: MoneyInput, quantity: MoneyInput, decimalPlaces = 2): Decimal {
  return quantizeMoney(money(amount).times(money(quantity)), decimalPlaces);
}

export function assertNonNegativeMoney(value: MoneyInput, fieldName = "amount"): Decimal {
  const amount = money(value);
  if (amount.isNegative()) {
    throw new Error(`${fieldName} cannot be negative`);
  }
  return amount;
}

export function assertAllocationWithinTotal(
  allocationAmounts: readonly MoneyInput[],
  permittedTotal: MoneyInput,
  decimalPlaces = 2
): Decimal {
  const allocated = addMoney(allocationAmounts, decimalPlaces);
  const limit = quantizeMoney(assertNonNegativeMoney(permittedTotal, "permittedTotal"), decimalPlaces);
  if (allocated.greaterThan(limit)) {
    throw new Error("Allocated payment components exceed the permitted total");
  }
  return allocated;
}

export function formatMoneyForStorage(value: MoneyInput, decimalPlaces = 2): string {
  return quantizeMoney(value, decimalPlaces).toFixed(decimalPlaces);
}
