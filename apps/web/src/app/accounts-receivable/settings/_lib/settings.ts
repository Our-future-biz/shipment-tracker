// Finance → Accounts Receivable → Reminder settings (step 7): the pure rules of the form, in the server's words
// (api lib/receivables settingsProblem). The server checks them again.

export const REMINDER_DAYS_MAX = 365;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The words shown while e-mail from the app is switched off. */
export const EMAIL_OFF_NOTE =
  "E-mail from the app is switched off: automatic reminders and statements by e-mail start once it is set up. Until then reminders are recorded by hand on the invoice.";

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
