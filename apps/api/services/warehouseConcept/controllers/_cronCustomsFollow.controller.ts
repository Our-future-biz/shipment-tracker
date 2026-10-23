import { api } from "encore.dev/api";
import { followAllCompanies, startCustomsFollowTimer } from "../services/customsFollow.service";

// Locally the timer does the cron's job (Encore cron jobs don't fire under `encore run`).
startCustomsFollowTimer();

// Called by the warehouse-customs-follow cron job (cloud deployments). Takes no input; safe to run
// alongside the timer (a record read lately is not read again).
export const _cronCustomsFollow = api(
  { expose: false, method: "POST", path: "/warehouse-concept/cron/customs-follow" },
  async (): Promise<{ changed: number }> => {
    return { changed: await followAllCompanies() };
  },
);
