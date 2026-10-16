import { CronJob } from "encore.dev/cron";
import { _cronShipmentOutbox } from "../controllers/_cronShipmentOutbox.controller";

// Sends the shipment updates gate stamps still owe (received / released date, plate) and
// retries those Shipments could not take. Cron jobs don't fire under `encore run` — locally the
// minute timer in shipmentOutbox.service does the same job.
export const warehouseShipmentOutbox = new CronJob("warehouse-shipment-outbox", {
  title: "Retry shipment updates from the gate",
  every: "1m",
  endpoint: _cronShipmentOutbox,
});
