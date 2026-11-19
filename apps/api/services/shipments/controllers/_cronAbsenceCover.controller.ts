import { api } from "encore.dev/api";
import { runAbsenceCovers, startAbsenceCoverTimer, type AbsenceCoverRun } from "../services/absenceCover.service";

// Locally the timer does the cron's job (Encore cron jobs don't fire under `encore run`).
startAbsenceCoverTimer();

// Called by the cron only (expose: false), without a login: sets the cover of every absence in force
// as the Holiday Cover of the absent user's active jobs that have none, and clears the covers whose
// absence ended, was shortened or deleted. Safe to run alongside the timer and twice at once.
export const _cronAbsenceCover = api(
  { expose: false, auth: false, method: "POST", path: "/internal/shipments/absence-cover/run" },
  async (): Promise<AbsenceCoverRun> => runAbsenceCovers(),
);
