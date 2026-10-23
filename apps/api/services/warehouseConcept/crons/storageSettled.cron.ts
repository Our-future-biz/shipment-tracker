import { CronJob } from "encore.dev/cron";
import { _cronStorageSettled } from "../controllers/_cronStorageSettled.controller";

// Sets "Storage settled" back to Pending on outbound cargo whose storage became chargeable and whose
// line nobody ticked by hand. Cron jobs don't fire under `encore run` — locally the timer in
// storageSettled.service does the same job.
export const warehouseStorageSettled = new CronJob("warehouse-storage-settled", {
  title: "Reopen Storage settled when storage becomes chargeable",
  every: "1h",
  endpoint: _cronStorageSettled,
});
