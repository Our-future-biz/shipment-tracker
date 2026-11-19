import { CronJob } from "encore.dev/cron";
import { _cronShipmentUserLinks } from "../controllers/_cronShipmentUserLinks.controller";

// Daily fill of the users' ids beside Handled By and Holiday Cover on the jobs written before every
// write set them (services/shipmentUserLinks.service). 02:30 UTC, before the working day in Prague.
// Cron jobs don't fire under `encore run`.
export const shipmentUserLinks = new CronJob("shipments-user-links", {
  title: "Link Handled By and Holiday Cover to their users",
  schedule: "30 2 * * *",
  endpoint: _cronShipmentUserLinks,
});
