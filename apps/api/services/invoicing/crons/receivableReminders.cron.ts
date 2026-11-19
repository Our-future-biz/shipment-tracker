import { CronJob } from "encore.dev/cron";
import { _cronReceivableReminders } from "../controllers/receivableStatement.controller";

// Accounts Receivable's automatic reminders 1 and 2 (step 7), once a day around 10:00 in Prague (mock test council K8):
// a cron schedule is in UTC, so 09:00 UTC is 10:00 in Prague in winter (CET, UTC+1) and 11:00 in summer (CEST, UTC+2) -
// never before 10:00, never later than 11:00, with no second run on the days the clocks change. The run sends nothing
// on a weekend or a Czech holiday (lib/reminderRules isReminderDay), and returns at once while e-mail from the app is
// switched off (lib/email) or a company's settings say off. Cron jobs don't fire under `encore run` (and there is no
// local timer: e-mail is off there anyway).
export const receivableReminders = new CronJob("invoicing-receivable-reminders", {
  title: "Send automatic payment reminders",
  schedule: "0 9 * * *",
  endpoint: _cronReceivableReminders,
});
