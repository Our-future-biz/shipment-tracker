import { CronJob } from "encore.dev/cron";
import { _cronReceivableReminders } from "../controllers/receivableStatement.controller";

// Accounts Receivable's automatic reminders 1 and 2 (step 7), once a day: 06:00 UTC, 07:00 or 08:00 in Prague. The run
// returns at once while e-mail from the app is switched off (lib/email) or a company's settings say off. Cron jobs
// don't fire under `encore run` (and there is no local timer: e-mail is off there anyway).
export const receivableReminders = new CronJob("invoicing-receivable-reminders", {
  title: "Send automatic payment reminders",
  schedule: "0 6 * * *",
  endpoint: _cronReceivableReminders,
});
