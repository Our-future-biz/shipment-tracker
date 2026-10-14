import { CronJob } from "encore.dev/cron";
import { _cronFxImport } from "../controllers/_cronFxImport.controller";

// Pulls at 15:00, 15:30 and 16:00 Prague time. Cron schedules are UTC, so every half
// hour 13:00–15:30 UTC on weekdays covers both winter and summer time; pullTick works out
// which Prague slot is due and skips the rest. Cron jobs don't fire under `encore run` —
// locally the minute timer in fxScheduler does the same job.
export const fxCnbImport = new CronJob("fx-cnb-import", {
  title: "Import ČNB exchange rates",
  schedule: "0,30 13-15 * * 1-5",
  endpoint: _cronFxImport,
});
