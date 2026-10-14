import { api } from "encore.dev/api";
import { pullTick } from "../services/fxScheduler";

// Called by the fx-cnb-import cron job (cloud deployments). Takes no input and is
// idempotent: it runs the 15:00 / 15:30 / 16:00 pull that is due, once per day.
export const _cronFxImport = api(
  { expose: false, method: "POST", path: "/fx/cron/import" },
  async (): Promise<void> => {
    await pullTick();
  },
);
