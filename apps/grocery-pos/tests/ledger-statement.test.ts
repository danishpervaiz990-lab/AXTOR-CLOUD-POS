import Decimal from "decimal.js";
import { LedgerDirection } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { applyLedgerEntry } from "@/server/finance/ledger-statement";

describe("ledger direction conventions", () => {
  it("increases customer receivable on debit and reduces it on credit", () => {
    let balance = new Decimal(0);
    balance = applyLedgerEntry(balance, "CUSTOMER", LedgerDirection.DEBIT, new Decimal("250.00"));
    balance = applyLedgerEntry(balance, "CUSTOMER", LedgerDirection.CREDIT, new Decimal("75.25"));
    expect(balance.toFixed(2)).toBe("174.75");
  });

  it("increases supplier payable on credit and reduces it on debit", () => {
    let balance = new Decimal(0);
    balance = applyLedgerEntry(balance, "SUPPLIER", LedgerDirection.CREDIT, new Decimal("900.00"));
    balance = applyLedgerEntry(balance, "SUPPLIER", LedgerDirection.DEBIT, new Decimal("300.00"));
    expect(balance.toFixed(2)).toBe("600.00");
  });
});
