import { CronJob } from "encore.dev/cron";
import { _cronCustomsFollow } from "../controllers/_cronCustomsFollow.controller";

// Reads the customs status of linked, open gate records from their shipments, so a status cleared
// in Shipments reaches the gate's Customs line without anyone pressing Refresh. Cron jobs don't
// fire under `encore run` — locally the timer in customsFollow.service does the same job.
export const warehouseCustomsFollow = new CronJob("warehouse-customs-follow", {
  title: "Read customs status from Shipments for the gate",
  every: "5m",
  endpoint: _cronCustomsFollow,
});
