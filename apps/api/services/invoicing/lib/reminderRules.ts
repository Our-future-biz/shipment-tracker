import { addDays } from "../../../lib/businessDate";
import { isWorkingDay, nextWorkingDay } from "../../../lib/workingDays";
import { daysOverdue } from "./supplierInvoices";
import type { ReceivableStatus } from "../interfaces/interfaces";

/**
 * Which automatic reminder an invoice is due today (Accounts Receivable step 7, switched off until e-mail from the app
 * is): reminder 1 at `reminder1Days` days overdue, reminder 2 at `reminder2Days`. Never the final notice (level 3):
 * that stays a manager's own act (D17). Pure, so the run's rules are tested on their own.
 *
 * Mock test council (19 Nov 2026, K8, K13, L2, X5): the run goes only on a Czech working day; a due day on a weekend or
 * holiday counts as due on the next working day; nothing is sent for a rest under 100 CZK / 5 EUR (another currency:
 * under 100 CZK at the invoice's own rate); only an invoice that became overdue after automatic reminders were switched
 * on is reminded (the older ones stay for a manager to chase by hand); and an invoice a bank entry still waiting to be
 * confirmed may pay is left alone.
 */

export interface ReminderSettings {
  reminder1Days: number;
  reminder2Days: number;
  /**
   * The day automatic reminders were switched on (yyyy-mm-dd): only invoices due on or after it - overdue only after
   * it - are reminded. null: not known, so none is (L2: never an old debt by surprise).
   */
  autoRemindersSince?: string | null;
}

/** The smallest rest the run reminds of (K13), per currency; another currency is weighed in CZK at the invoice's own rate. */
export const REMINDER_FLOOR: Readonly<Record<string, number>> = { CZK: 100, EUR: 5 };

export interface ReminderCandidate {
  status: ReceivableStatus;
  leftToPay: number;
  /** The invoice's due day (yyyy-mm-dd); a weekend or holiday counts as due on the next working day */
  dueDate: string;
  currency: string;
  /** CZK per 1 unit (the invoice's own ČNB rate): weighs a rest in another currency against the floor */
  fxRate?: number;
  disputed: boolean;
  promisedOn: string | null;
  /** The highest reminder recorded so far (0 none) */
  reminderLevel: number;
  lastRemindedOn: string | null;
  /** Write-offs and bank charges waiting for a second manager (they count for nothing yet) */
  waiting?: number;
  /** A bank entry not confirmed yet may pay it (X5): the customer may have paid */
  paymentWaiting?: boolean;
}

/** Why an invoice gets no automatic reminder today, or the level it gets. */
export type ReminderDecision =
  | { level: 1 | 2 }
  | { level: null; why: "not_owed" | "not_due" | "disputed" | "promised" | "done" | "too_soon" | "waiting" | "payment_waiting" | "small" | "before_switch_on" };

/** The day a reminder counts the invoice due: its due day, or the next working day when that is a weekend or a holiday. */
export const reminderDueDay = (dueDate: string, holidays: readonly string[] = []): string =>
  isWorkingDay(dueDate, holidays) ? dueDate : nextWorkingDay(dueDate, holidays);

/** Days overdue as the reminders count them: from the reminder's due day (reminderDueDay); 0 while not past it. */
export function reminderOverdueDays(dueDate: string, today: string, holidays: readonly string[] = []): number {
  const due = reminderDueDay(dueDate, holidays);
  return due < today ? daysOverdue(due, today) : 0;
}

/** Whether the rest is under the floor (K13): too small for an automatic reminder. */
export function underReminderFloor(leftToPay: number, currency: string, fxRate?: number): boolean {
  const own = REMINDER_FLOOR[currency];
  if (own !== undefined) return leftToPay < own;
  // Another currency: weighed in CZK at the invoice's own rate; with no rate, no floor.
  if (!(fxRate && fxRate > 0)) return false;
  return leftToPay * fxRate < REMINDER_FLOOR.CZK!;
}

/** Whether the run may remind on this day at all (K8): a Czech working day. */
export const isReminderDay = (today: string, holidays: readonly string[] = []): boolean => isWorkingDay(today, holidays);

/**
 * The reminder due: none for an invoice not owed (paid, credited, cancelled, to refund), disputed, a bank payment
 * waiting to be confirmed, a rest under the floor, due before automatic reminders were switched on, or with a promise
 * still running (promised on or after today); else reminder 1 once it is `reminder1Days` overdue and none was sent,
 * then reminder 2 once it is `reminder2Days` overdue and at most reminder 1 was sent. Reminder 2 also waits until
 * the last reminder is at least (reminder2Days − reminder1Days) days old, so a customer never gets two reminders a day
 * apart. Days overdue count from the reminder's due day (a weekend or holiday moves it to the next working day).
 */
export function reminderDue(c: ReminderCandidate, settings: ReminderSettings, today: string, holidays: readonly string[] = []): ReminderDecision {
  if (!(c.leftToPay > 0) || (c.status !== "unpaid" && c.status !== "part_paid")) return { level: null, why: "not_owed" };
  if (c.disputed) return { level: null, why: "disputed" };
  // A write-off or bank charge waiting for a second manager covers what is left: once confirmed nothing is owed, so
  // the customer is not reminded of it meanwhile.
  if (Math.round((c.waiting ?? 0) * 100) >= Math.round(c.leftToPay * 100)) return { level: null, why: "waiting" };
  if (c.paymentWaiting) return { level: null, why: "payment_waiting" };
  if (underReminderFloor(c.leftToPay, c.currency, c.fxRate)) return { level: null, why: "small" };
  const dueDay = reminderDueDay(c.dueDate, holidays);
  if (!settings.autoRemindersSince || dueDay < settings.autoRemindersSince) return { level: null, why: "before_switch_on" };
  if (c.promisedOn && c.promisedOn >= today) return { level: null, why: "promised" };
  if (c.reminderLevel >= 2) return { level: null, why: "done" };
  const overdue = reminderOverdueDays(c.dueDate, today, holidays);
  if (c.reminderLevel < 1) return overdue >= settings.reminder1Days ? { level: 1 } : { level: null, why: "not_due" };
  if (overdue < settings.reminder2Days) return { level: null, why: "not_due" };
  const gap = Math.max(1, settings.reminder2Days - settings.reminder1Days);
  if (c.lastRemindedOn && c.lastRemindedOn > addDays(today, -gap)) return { level: null, why: "too_soon" };
  return { level: 2 };
}

/** The key that makes one mail per invoice and level, ever. */
export const reminderKey = (invoiceId: string, level: number) => `reminder:${invoiceId}:${level}`;
