import { CronJob } from "encore.dev/cron";
import { _cronAbsenceCover } from "../controllers/_cronAbsenceCover.controller";

// The dated Holiday Cover (Council Outlay 11, D12): while a user is away with a cover named, the cover
// is set on their active jobs with no Holiday Cover, and cleared again once the absence is over. Cron
// jobs don't fire under `encore run` - locally the timer in absenceCover.service does the same job.
export const absenceCover = new CronJob("shipments-absence-cover", {
  title: "Set and clear the Holiday Cover of absences",
  every: "15m",
  endpoint: _cronAbsenceCover,
});
