import log from "encore.dev/log";
import { sql } from "drizzle-orm";
import { gateMovementRepository, type GateMovementRow } from "../repositories/gateMovement.repository";
import { gateMovementTable } from "../schemas/gateMovement.schema";
import { reopenedGates, storageLineToReopen, STORAGE_REOPENED_EVENT } from "./storageSettled";

// Sets "Storage settled" back to Pending on outbound cargo whose storage became chargeable
// (storageSettled.ts says when). Runs on a clock for every company, and on the one record right
// before its WH release, so a release in the hour after the clock turned is caught too.

const t = gateMovementTable;

/** How often the clock runs (the cron's schedule and the local timer). */
export const STORAGE_SETTLED_EVERY_MS = 60 * 60_000;

/** Reopens the line of one record if it is due; true when it changed. */
export async function reopenStorageLine(m: GateMovementRow, now = new Date()): Promise<boolean> {
  if (!storageLineToReopen(m, now)) return false;
  // Only on the gates as they were read and before the release: a tick meanwhile wins.
  const row = await gateMovementRepository.conditionalUpdate(
    m.id,
    m.companyId,
    { releaseGates: reopenedGates(m.releaseGates) },
    [{ kind: STORAGE_REOPENED_EVENT, label: "Storage settled back to Pending — storage became chargeable", at: now.toISOString(), by: "Warehouse" }],
    sql`${t.releaseGates} = ${JSON.stringify(m.releaseGates)}::jsonb AND ${t.impRelease} IS NULL`,
  );
  return !!row;
}

/** One run over a company's open records; returns how many lines went back to Pending. */
export async function reopenChargeableStorage(companyId: string, now = new Date()): Promise<number> {
  let n = 0;
  for (const m of await gateMovementRepository.listAll(companyId)) if (await reopenStorageLine(m, now)) n++;
  return n;
}

/** One run over every company with open records. */
export async function reopenChargeableStorageAll(now = new Date()): Promise<number> {
  let n = 0;
  for (const companyId of await gateMovementRepository.companiesWithOpenRecords()) {
    try {
      n += await reopenChargeableStorage(companyId, now);
    } catch (err) {
      log.warn(err, "warehouse: storage settled check failed for a company", { companyId });
    }
  }
  return n;
}

let started = false;

// Encore cron jobs do not fire under `encore run`, so a timer does the same job locally.
export function startStorageSettledTimer(): void {
  if (started || process.env.VITEST) return;
  started = true;
  setInterval(() => void reopenChargeableStorageAll().catch((err) => log.warn(err, "warehouse: storage settled run failed")), STORAGE_SETTLED_EVERY_MS).unref();
}
