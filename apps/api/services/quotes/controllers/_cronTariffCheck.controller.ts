import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import { runTariffCheck, startLocalTariffCheck } from "../services/tariffOvernight.service";

startLocalTariffCheck();

// Takes no input. Companies' quotes are all checked in the one run.
export const _cronTariffCheck = api({ expose: false, method: "POST", path: "/internal/quotes/tariff-check" }, async (): Promise<void> => {
  await runTariffCheck();
});

// 02:00 UTC: at night in Prague, summer and winter (cron schedules are UTC).
export const quotesTariffCheck = new CronJob("quotes-tariff-check", {
  title: "Check the tariffs of quotes not yet sent",
  schedule: "0 2 * * *",
  endpoint: _cronTariffCheck,
});
