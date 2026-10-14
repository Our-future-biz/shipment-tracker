import { appMeta } from "encore.dev";
import log from "encore.dev/log";
import { cnbRateRepository } from "../repositories/cnbRate.repository";
import { LAST_PULL_MINUTES, PULL_SLOTS, isFixingDay, pragueMinutes, pragueToday } from "../lib/dates";
import { ensureFresh, syncNow } from "./fxImport.service";
import { raiseMissingFixing } from "./fxAlert.service";

// The daily ČNB pull: 15:00 Prague time on fixing days, retried at 15:30 and 16:00; still
// missing after 16:00 → reported to the admins. A minute timer drives it locally only
// (Encore cron jobs don't fire under `encore run`); in the cloud the fx-cnb-import cron calls
// pullTick instead. Either way a slot runs once per day and an import that finds today's
// fixing stored does nothing.
const TICK_MS = 60_000;
const STARTUP_DELAY_MS = 5_000;

let started = false;
let slotsDoneFor = "";
let slotsDone = new Set<number>();

export async function pullTick(now = new Date()): Promise<void> {
  const today = pragueToday(now);
  if (!isFixingDay(today)) return;
  if (slotsDoneFor !== today) {
    slotsDoneFor = today;
    slotsDone = new Set();
  }
  const minutes = pragueMinutes(now);
  const due = PULL_SLOTS.filter((s) => s <= minutes && !slotsDone.has(s));
  if (!due.length) return;
  // Started late (e.g. the app was off at 15:00): one pull covers every slot that is due.
  for (const s of due) slotsDone.add(s);
  const slot = due.at(-1)!;

  try {
    let latest = await cnbRateRepository.latestValidDate();
    let reason = "";
    if (!latest || latest < today) {
      const res = await syncNow("schedule", undefined, true);
      latest = await cnbRateRepository.latestValidDate();
      reason =
        res.status === "failed"
          ? `The import failed: ${res.error ?? "unknown error"}`
          : `ČNB had not published a fixing for today (newest available: ${res.latestValidDate ?? "none"})`;
    }
    if ((!latest || latest < today) && slot === LAST_PULL_MINUTES) {
      await raiseMissingFixing(today, reason);
    }
  } catch (err) {
    log.error(err, "fx: scheduled pull failed");
    if (slot === LAST_PULL_MINUTES) {
      await raiseMissingFixing(today, "The scheduled pull failed — see the import log").catch((alertErr: unknown) =>
        log.error(alertErr, "fx: could not raise the missing-fixing alert", { fixingDate: today }),
      );
    }
  }
}

export function startFxScheduler(): void {
  if (started || process.env.VITEST) return;
  started = true;
  // In the cloud the cron drives the pulls; a timer on every instance would only repeat them.
  if (appMeta().environment.cloud !== "local") return;
  // On start, fill in any fixings missed while the app was off (earlier days, or today
  // after 15:00), then keep the daily schedule.
  setTimeout(() => void ensureFresh("startup").then(() => pullTick()), STARTUP_DELAY_MS).unref();
  setInterval(() => void pullTick(), TICK_MS).unref();
}
