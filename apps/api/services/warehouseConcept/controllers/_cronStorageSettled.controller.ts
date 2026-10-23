import { api } from "encore.dev/api";
import { reopenChargeableStorageAll, startStorageSettledTimer } from "../services/storageSettled.service";

// Locally the timer does the cron's job (Encore cron jobs don't fire under `encore run`).
startStorageSettledTimer();

// Called by the warehouse-storage-settled cron job (cloud deployments). Takes no input; safe to run
// alongside the timer (a line goes back to Pending once, on the gates as they were read).
export const _cronStorageSettled = api(
  { expose: false, method: "POST", path: "/warehouse-concept/cron/storage-settled" },
  async (): Promise<{ reopened: number }> => {
    return { reopened: await reopenChargeableStorageAll() };
  },
);
