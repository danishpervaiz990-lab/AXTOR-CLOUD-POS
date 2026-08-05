export const CHEQUE_STATUSES = [
  "RECEIVED",
  "ISSUED",
  "POST_DATED",
  "DUE_TODAY",
  "DEPOSITED",
  "SUBMITTED_FOR_CLEARING",
  "CLEARED",
  "BOUNCED",
  "RETURNED",
  "REPLACED",
  "CANCELLED",
  "STOPPED"
] as const;

export type ChequeStatusValue = (typeof CHEQUE_STATUSES)[number];

const allowedTransitions: Record<ChequeStatusValue, ReadonlySet<ChequeStatusValue>> = {
  RECEIVED: new Set(["POST_DATED", "DUE_TODAY", "DEPOSITED", "RETURNED", "CANCELLED"]),
  ISSUED: new Set(["POST_DATED", "DUE_TODAY", "SUBMITTED_FOR_CLEARING", "STOPPED", "CANCELLED"]),
  POST_DATED: new Set(["DUE_TODAY", "DEPOSITED", "SUBMITTED_FOR_CLEARING", "RETURNED", "STOPPED", "CANCELLED"]),
  DUE_TODAY: new Set(["DEPOSITED", "SUBMITTED_FOR_CLEARING", "RETURNED", "STOPPED", "CANCELLED"]),
  DEPOSITED: new Set(["CLEARED", "BOUNCED", "RETURNED"]),
  SUBMITTED_FOR_CLEARING: new Set(["CLEARED", "BOUNCED", "RETURNED", "STOPPED"]),
  CLEARED: new Set([]),
  BOUNCED: new Set(["REPLACED", "RETURNED"]),
  RETURNED: new Set(["REPLACED"]),
  REPLACED: new Set([]),
  CANCELLED: new Set([]),
  STOPPED: new Set(["RETURNED", "REPLACED"])
};

export function canTransitionCheque(from: ChequeStatusValue, to: ChequeStatusValue): boolean {
  return allowedTransitions[from].has(to);
}

export function assertChequeTransition(from: ChequeStatusValue, to: ChequeStatusValue): void {
  if (from === to) {
    throw new Error("Cheque is already in the requested status");
  }
  if (!canTransitionCheque(from, to)) {
    throw new Error(`Invalid cheque transition: ${from} -> ${to}`);
  }
}

export function isTerminalChequeStatus(status: ChequeStatusValue): boolean {
  return allowedTransitions[status].size === 0;
}

export const CHEQUE_REMINDER_DAY_OFFSETS = [30, 15, 7, 3, 1, 0] as const;
export const CHEQUE_OVERDUE_DAY_OFFSETS = [1, 3, 7, 14, 30] as const;

function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function daysUntilChequeDue(dueDate: Date, now = new Date()): number {
  return Math.round((startOfUtcDay(dueDate) - startOfUtcDay(now)) / 86_400_000);
}

export function reminderKeyForCheque(dueDate: Date, now = new Date()): string | null {
  const days = daysUntilChequeDue(dueDate, now);
  if (CHEQUE_REMINDER_DAY_OFFSETS.includes(days as (typeof CHEQUE_REMINDER_DAY_OFFSETS)[number])) {
    return days === 0 ? "DUE_TODAY" : `DUE_IN_${days}_DAYS`;
  }

  const overdueDays = Math.abs(days);
  if (days < 0 && CHEQUE_OVERDUE_DAY_OFFSETS.includes(overdueDays as (typeof CHEQUE_OVERDUE_DAY_OFFSETS)[number])) {
    return `OVERDUE_${overdueDays}_DAYS`;
  }

  return null;
}
