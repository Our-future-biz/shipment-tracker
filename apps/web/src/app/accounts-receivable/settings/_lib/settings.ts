import { formatDate } from "@/lib/date";

// Finance → Accounts Receivable → Reminder settings (step 7): the pure rules of the form, in the server's words
// (api lib/receivables settingsProblem). The server checks them again.

export const REMINDER_DAYS_MAX = 365;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The words shown while e-mail from the app is switched off. */
export const EMAIL_OFF_NOTE =
  "E-mail from the app is switched off: automatic reminders and statements by e-mail start once it is set up. Until then reminders are recorded by hand on the invoice.";

/**
 * Which overdue invoices the automatic reminders take (mock test council L2): only those due on or after the day they
 * start; the older ones stay for a manager to chase by hand. That day is the first day e-mail from the app can really
 * send (P3): the first daily run with them on and e-mail on sets it - never a save while e-mail is off.
 */
export function switchOnText(autoReminders: boolean, since: string | null | undefined, emailOn = true): string {
  if (!autoReminders) {
    return "Switched on, they remind only invoices due from the first day e-mail from the app can send: the older ones stay for a manager to chase by hand.";
  }
  if (!since) {
    return emailOn
      ? "On: the next daily run sets the day they start and sends nothing that day; only invoices due from then on are reminded, the older ones stay for a manager to chase by hand."
      : "On, waiting for e-mail from the app: they start on the first day it can send, with invoices due from that day on; the older ones stay for a manager to chase by hand.";
  }
  return `On since ${formatDate(since)}: only invoices due on or after that day are reminded; the older ones stay for a manager to chase by hand.`;
}

/**
 * The last day the daily run skipped the reminders (mock test council P11, m5): no bank statement was read since the
 * previous working day, so a payment may not be known yet. Null when it never did (or they are off).
 */
export function skippedText(skipped: { on: string; since: string | null } | null | undefined): string | null {
  if (!skipped) return null;
  return skipped.since
    ? `Skipped on ${formatDate(skipped.on)}: no bank statement read since ${formatDate(skipped.since)}`
    : `Skipped on ${formatDate(skipped.on)}: no bank statement read since the previous working day`;
}

export interface SettingsForm {
  autoReminders: boolean;
  /** As typed */
  reminder1Days: string;
  reminder2Days: string;
  replyTo: string;
}

const wholeDays = (text: string): number | null => (/^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : null);

/** Why the settings are not saved ("" when they are): reminder 1 at 1–365 days, reminder 2 later, at most 365; a reply-to e-mail or none. */
export function settingsProblem(f: SettingsForm): string {
  const one = wholeDays(f.reminder1Days);
  const two = wholeDays(f.reminder2Days);
  if (one === null || one < 1 || one > REMINDER_DAYS_MAX) return `Reminder 1 is sent 1 to ${REMINDER_DAYS_MAX} days after the due day`;
  if (two === null || two <= one || two > REMINDER_DAYS_MAX) return `Reminder 2 is sent after reminder 1, at most ${REMINDER_DAYS_MAX} days after the due day`;
  const to = f.replyTo.trim();
  if (to && !EMAIL.test(to)) return "The reply-to address must be an e-mail (or left empty)";
  return "";
}

/** What the save sends (only once settingsProblem is ""). */
export const settingsInput = (f: SettingsForm) => ({
  autoReminders: f.autoReminders,
  reminder1Days: Number(f.reminder1Days.trim()),
  reminder2Days: Number(f.reminder2Days.trim()),
  replyTo: f.replyTo.trim(),
});

/** The form as the settings are saved. */
export const formOf = (s: { autoReminders: boolean; reminder1Days: number; reminder2Days: number; replyTo: string }): SettingsForm => ({
  autoReminders: s.autoReminders,
  reminder1Days: String(s.reminder1Days),
  reminder2Days: String(s.reminder2Days),
  replyTo: s.replyTo,
});

/** Whether the form differs from what is saved. */
export const isChanged = (f: SettingsForm, saved: SettingsForm): boolean =>
  f.autoReminders !== saved.autoReminders ||
  f.reminder1Days.trim() !== saved.reminder1Days ||
  f.reminder2Days.trim() !== saved.reminder2Days ||
  f.replyTo.trim() !== saved.replyTo.trim();
