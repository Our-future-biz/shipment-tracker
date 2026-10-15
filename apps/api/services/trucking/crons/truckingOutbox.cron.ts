import { CronJob } from "encore.dev/cron";
import { _cronTruckingOutbox } from "../controllers/_cronTruckingOutbox.controller";

// Sends what consignments and trips still owe their jobs (dates, plate, Billing, Costs lines) and
// retries what Shipments or Invoicing could not take. Cron jobs don't fire under `encore run` -
// locally the minute timer in truckingOutbox.service does the same job.
export const truckingShipmentOutbox = new CronJob("trucking-shipment-outbox", {
  title: "Retry job updates from Trucking",
  every: "1m",
  endpoint: _cronTruckingOutbox,
});
