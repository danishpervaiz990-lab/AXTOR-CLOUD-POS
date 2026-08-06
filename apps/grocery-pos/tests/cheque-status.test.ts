import { describe, expect, it } from "vitest";
import {
  assertChequeTransition,
  canTransitionCheque,
  daysUntilChequeDue,
  isTerminalChequeStatus,
  reminderKeyForCheque
} from "@/server/finance/cheque-status";

describe("cheque state machine", () => {
  it("supports inward deposit and clearing", () => {
    expect(canTransitionCheque("RECEIVED", "DEPOSITED")).toBe(true);
    expect(canTransitionCheque("DEPOSITED", "CLEARED")).toBe(true);
  });

  it("supports bounce and replacement without treating the cheque as cleared", () => {
    expect(canTransitionCheque("DEPOSITED", "BOUNCED")).toBe(true);
    expect(canTransitionCheque("BOUNCED", "REPLACED")).toBe(true);
    expect(isTerminalChequeStatus("CLEARED")).toBe(true);
    expect(isTerminalChequeStatus("REPLACED")).toBe(true);
  });

  it("rejects invalid direct transitions", () => {
    expect(() => assertChequeTransition("POST_DATED", "CLEARED")).toThrow(
      "Invalid cheque transition: POST_DATED -> CLEARED"
    );
    expect(() => assertChequeTransition("CLEARED", "BOUNCED")).toThrow();
  });

  it("generates the required due-date reminder keys", () => {
    const now = new Date("2026-08-06T10:00:00.000Z");
    expect(daysUntilChequeDue(new Date("2026-09-05T22:00:00.000Z"), now)).toBe(30);
    expect(reminderKeyForCheque(new Date("2026-09-05T00:00:00.000Z"), now)).toBe("DUE_IN_30_DAYS");
    expect(reminderKeyForCheque(new Date("2026-08-13T00:00:00.000Z"), now)).toBe("DUE_IN_7_DAYS");
    expect(reminderKeyForCheque(new Date("2026-08-06T23:59:00.000Z"), now)).toBe("DUE_TODAY");
    expect(reminderKeyForCheque(new Date("2026-08-03T00:00:00.000Z"), now)).toBe("OVERDUE_3_DAYS");
  });
});
