import { CronJob } from "encore.dev/cron";
import { _cronShipmentPushOutbox } from "../controllers/_cronShipmentPushOutbox.controller";

// Sends the shipment changes owed to Trucking and the gate records that could not go straight
// away, with retries. Cron jobs don't fire under `encore run` - locally the minute timer in
// shipmentPush.service does it.
export const shipmentPushOutbox = new CronJob("shipments-push-outbox", {
  title: "Pass shipment changes to Trucking and the warehouse",
  every: "1m",
  endpoint: _cronShipmentPushOutbox,
});
