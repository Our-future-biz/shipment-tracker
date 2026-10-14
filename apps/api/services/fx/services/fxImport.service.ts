import log from "encore.dev/log";
import { cnbRateRepository } from "../repositories/cnbRate.repository";
import { cnbImportRunRepository } from "../repositories/cnbImportRun.repository";
import { fetchDaily, fetchYear, type CnbRow } from "../lib/cnb";
import { addDays, expectedLatestFixing, pragueToday, previousFixingDay } from "../lib/dates";
import type { SyncResult, SyncTrigger } from "../interfaces/interfaces";
import { resolveAlertsUpTo } from "./fxAlert.service";

// History starts here (owner decision, 14 Oct 2026). An empty table backfills from it.
export const BACKFILL_FROM = "2024-01-01";
// A failed or empty check is not repeated more often than this, whatever triggers it.
const MIN_GAP_MS = 10 * 60 * 1000;

let running: Promise<SyncResult> | null = null;
let lastAttemptAt = 0;

/**
 * Imports any ČNB fixings not stored yet. One import at a time: a call made while one
 * runs waits for it. Without `force`, a call within MIN_GAP_MS of the last attempt is
 * skipped, so page loads and timers can call this freely.
 */
export function syncNow(trigger: SyncTrigger, userId?: string, force = false): Promise<SyncResult> {
  if (running) return running;
  if (!force && Date.now() - lastAttemptAt < MIN_GAP_MS) return Promise.resolve({ skipped: true });
  running = runImport(trigger, userId).finally(() => {
    running = null;
  });
  return running;
}

// Starts an import only when the newest stored fixing is older than the one ČNB should
// have published by now. Never throws — failures are recorded in the import log.
export async function ensureFresh(trigger: SyncTrigger): Promise<void> {
  try {
    const latest = await cnbRateRepository.latestValidDate();
    if (latest && latest >= expectedLatestFixing()) return;
    await syncNow(latest ? trigger : "backfill");
  } catch (err) {
    log.error(err, "fx: freshness check failed");
  }
}

async function runImport(trigger: SyncTrigger, userId?: string): Promise<SyncResult> {
  lastAttemptAt = Date.now();
  const latestStored = await cnbRateRepository.latestValidDate();
  const from = latestStored ? addDays(latestStored, 1) : BACKFILL_FROM;
  const run = await cnbImportRunRepository.start({
    trigger: latestStored ? trigger : "backfill",
    triggeredBy: userId ?? null,
    fromDate: from,
  });

  try {
    // One small call tells us the newest fixing ČNB has.
    const rows: CnbRow[] = await fetchDaily(pragueToday());
    const latestOffered = rows.reduce<string | null>((m, r) => (!m || r.validDate > m ? r.validDate : m), null);

    // Anything between our newest fixing and ČNB's newest comes from the yearly files.
    if (latestOffered && (!latestStored || latestStored < previousFixingDay(latestOffered))) {
      const firstYear = Number(from.slice(0, 4));
      const lastYear = Number(latestOffered.slice(0, 4));
      for (let y = firstYear; y <= lastYear; y++) rows.push(...(await fetchYear(y)));
    }

    const added = await cnbRateRepository.insertNew(
      rows
        .filter((r) => r.validDate >= BACKFILL_FROM)
        .map((r) => ({
          validDate: r.validDate,
          currency: r.currency,
          amount: r.amount,
          rate: String(r.rate),
          fixingNo: r.fixingNo,
          source: "CNB_API",
          importRunId: run.id,
        })),
    );
    const status = added > 0 ? "ok" : "no_new_data";
    await cnbImportRunRepository.finish(run.id, { status, rowsAdded: added, latestValidDate: latestOffered, toDate: latestOffered });
    // A fixing that was reported missing and has now arrived closes its alert.
    await resolveAlertsUpTo(await cnbRateRepository.latestValidDate());
    if (added > 0) log.info("fx: ČNB fixings imported", { trigger, added, latestOffered });
    return { skipped: false, status, rowsAdded: added, latestValidDate: latestOffered };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(err, "fx: ČNB import failed", { trigger });
    await cnbImportRunRepository.finish(run.id, { status: "failed", error: message.slice(0, 500) });
    return { skipped: false, status: "failed", rowsAdded: 0, error: message };
  }
}
