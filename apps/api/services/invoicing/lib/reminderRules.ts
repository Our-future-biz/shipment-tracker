import { addDays } from "../../../lib/businessDate";
import type { ReceivableStatus } from "../interfaces/interfaces";

/**
 * Which automatic reminder an invoice is due today (Accounts Receivable step 7, switched off until e-mail from the app
 * is): reminder 1 at `reminder1Days` days overdue, reminder 2 at `reminder2Days`. Never the final notice (level 3):
 * that stays a manager's own act (D17). Pure, so the run's rules are tested on their own.
 */

export interface ReminderSettings {
  reminder1Days: number;
  reminder2Days: number;
}

export interface ReminderCandidate {
  status: ReceivableStatus;
  leftToPay: number;
  daysOverdue: number;
  disputed: boolean;
  promisedOn: string | null;
  /** The highest reminder recorded so far (0 none) */
  reminderLevel: number;
  lastRemindedOn: string | null;
  /** Write-offs and bank charges waiting for a second manager (they count for nothing yet) */
  waiting?: number;
}

/** Why an invoice gets no automatic reminder today, or the level it gets. */
export type ReminderDecision =
  | { level: 1 | 2 }
  | { level: null; why: "not_owed" | "not_due" | "disputed" | "promised" | "done" | "too_soon" | "waiting" };

/**
 * The reminder due: none for an invoice not owed (paid, credited, cancelled, to refund), disputed, or with a promise
 * still running (promised on or after today); else reminder 1 once it is `reminder1Days` overdue and none was sent,
 * then reminder 2 once it is `reminder2Days` overdue and at most reminder 1 was sent. Reminder 2 also waits until
 * the last reminder is at least (reminder2Days − reminder1Days) days old, so a customer never gets two reminders a day
 * apart (when automatic reminders are switched on for an invoice already long overdue, reminder 1 goes first).
 */
export function reminderDue(c: ReminderCandidate, settings: ReminderSettings, today: string): ReminderDecision {
  if (!(c.leftToPay > 0) || (c.status !== "unpaid" && c.status !== "part_paid")) return { level: null, why: "not_owed" };
  if (c.disputed) return { level: null, why: "disputed" };
  // A write-off or bank charge waiting for a second manager covers what is left: once confirmed nothing is owed, so
  // the customer is not reminded of it meanwhile.
  if (Math.round((c.waiting ?? 0) * 100) >= Math.round(c.leftToPay * 100)) return { level: null, why: "waiting" };
  if (c.promisedOn && c.promisedOn >= today) return { level: null, why: "promised" };
  if (c.reminderLevel >= 2) return { level: null, why: "done" };
  if (c.reminderLevel < 1) return c.daysOverdue >= settings.reminder1Days ? { level: 1 } : { level: null, why: "not_due" };
  if (c.daysOverdue < settings.reminder2Days) return { level: null, why: "not_due" };
  const gap = Math.max(1, settings.reminder2Days - settings.reminder1Days);
  if (c.lastRemindedOn && c.lastRemindedOn > addDays(today, -gap)) return { level: null, why: "too_soon" };
  return { level: 2 };
}

/** The key that makes one mail per invoice and level, ever. */
export const reminderKey = (invoiceId: string, level: number) => `reminder:${invoiceId}:${level}`;
