import { api } from "encore.dev/api";
import { deliverDue, startOutboxTimer, warnStaleOutbox } from "../services/truckingOutbox.service";

// Locally the minute timer does the cron's job (Encore cron jobs don't fire under `encore run`).
startOutboxTimer();

// Called by the trucking-shipment-outbox cron job (cloud deployments). Takes no input and is safe
// to run alongside the timer: rows are claimed once.
export const _cronTruckingOutbox = api(
  { expose: false, method: "POST", path: "/trucking/cron/outbox" },
  async (): Promise<void> => {
    await deliverDue();
    // Monitoring: updates still pending after 10 minutes are logged as a warning.
    await warnStaleOutbox();
  },
);
