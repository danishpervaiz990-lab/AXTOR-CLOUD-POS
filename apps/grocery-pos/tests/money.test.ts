import { describe, expect, it } from "vitest";
import {
  addMoney,
  assertAllocationWithinTotal,
  formatMoneyForStorage,
  multiplyMoney,
  subtractMoney
} from "@/lib/money";

describe("Decimal money primitives", () => {
  it("does not inherit binary floating-point addition errors", () => {
    expect(formatMoneyForStorage(addMoney(["0.1", "0.2"]))).toBe("0.30");
  });

  it("calculates weighted grocery lines with explicit rounding", () => {
    expect(formatMoneyForStorage(multiplyMoney("12.75", "0.450"))).toBe("5.74");
    expect(formatMoneyForStorage(multiplyMoney("8.40", "1.250"))).toBe("10.50");
    expect(formatMoneyForStorage(multiplyMoney("6.95", "2.750"))).toBe("19.11");
  });

  it("reconciles receipts and payments", () => {
    const closing = subtractMoney(addMoney(["100.00", "250.50"]), "75.25");
    expect(formatMoneyForStorage(closing)).toBe("275.25");
  });

  it("prevents split-payment components from exceeding the permitted total", () => {
    expect(() => assertAllocationWithinTotal(["60.00", "40.01"], "100.00")).toThrow(
      "Allocated payment components exceed the permitted total"
    );
    expect(formatMoneyForStorage(assertAllocationWithinTotal(["60", "40"], "100"))).toBe("100.00");
  });
});
