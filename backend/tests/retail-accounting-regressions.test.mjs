import test from "node:test";
import assert from "node:assert/strict";
import { initialPaymentBreakdown, profitLossAfterReturns, transactionBelongsToShift } from "../dist/services/retail-accounting.helpers.js";

test("shift sales use original payment lines instead of later invoice paid total", () => {
  const breakdown = initialPaymentBreakdown({
    total: 1000,
    paid: 1000,
    paymentMethod: "cash",
    metadata: { paymentLines: [{ method: "cash", amount: 500 }] },
  });
  assert.deepEqual(breakdown, { cash: 500, card: 0, bank: 0, other: 0, initialPaid: 500, credit: 500 });
});

test("customer receipts are attributed only to their receiving shift", () => {
  assert.equal(transactionBelongsToShift({ allocation: { source: "receive_payment", shiftId: "shift-1" } }, "shift-1", "receive_payment"), true);
  assert.equal(transactionBelongsToShift({ allocation: { source: "receive_payment", shiftId: "shift-2" } }, "shift-1", "receive_payment"), false);
  assert.equal(transactionBelongsToShift({ allocation: { source: "sales_document_posting", shiftId: "shift-1" } }, "shift-1", "receive_payment"), false);
});

test("profit and loss reverses returned revenue and returned cost", () => {
  assert.deepEqual(profitLossAfterReturns({ grossRevenue: 100000, grossCogs: 60000, returnedRevenue: 2100, returnedCogs: 1200, expenses: 500 }), {
    revenue: 97900,
    cogs: 58800,
    grossProfit: 39100,
    netProfit: 38600,
  });
});
