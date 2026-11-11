import { CronJob } from "encore.dev/cron";
import { _cronShipmentEventOutbox } from "../controllers/_cronShipmentEventOutbox.controller";

// Publishes the shipment-deleted events a delete could not publish straight away, with retries.
// Cron jobs don't fire under `encore run` - locally the minute timer in shipmentEvents.service does it.
export const shipmentEventOutbox = new CronJob("shipments-event-outbox", {
  title: "Publish shipment deletes",
  every: "1m",
  endpoint: _cronShipmentEventOutbox,
});
