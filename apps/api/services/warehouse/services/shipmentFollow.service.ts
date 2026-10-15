import { sql } from "drizzle-orm";
import log from "encore.dev/log";
import { shipments } from "~encore/clients";
import { gateMovementRepository, type GateMovementRow } from "../repositories/gateMovement.repository";
import { gateMovementTable, type GateMovementRecord } from "../schemas/gateMovement.schema";
import { customsLine, isCustomsStatus, setCustomsLineSql } from "./customs";

// Customs follow: the customs status of a gate record linked to a shipment follows the
// shipment (Shipments works it out from its documents). It is read from the shipments service
// when the gate job is opened or refreshed and, for a limited number of records, when the Gate
// Log is listed; a changed status updates the Customs line of the release gates, logged as
// "Customs status from shipment". Released records keep what they were released with.
// Reads use the caller's own access to Shipments.

/** A record opened on its own is read again after this long. */
export const FOLLOW_ON_GET_MS = 30_000;
/** Records in the list are read again after this long. */
export const FOLLOW_ON_LIST_MS = 5 * 60_000;
/** Records one list call reads at most (the others wait for the next list). */
export const FOLLOW_LIST_LIMIT = 25;
const PARALLEL = 4;
// The list never waits longer than this for Shipments; slower answers are left for next time.
const BUDGET_MS = 3_000;

const t = gateMovementTable;

type Fetched = { ok: true; customsStatus: string } | { ok: false; error: string };

// Reads each shipment once, at most PARALLEL at a time, within the time budget. Shipments not
// answered in time are missing from the result.
async function fetchStatuses(shipmentIds: string[], budgetMs: number): Promise<Map<string, Fetched>> {
  const out = new Map<string, Fetched>();
  const queue = [...shipmentIds];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const { shipment } = await shipments.shipmentGet({ shipmentId: id });
        out.set(id, { ok: true, customsStatus: shipment.customsStatus });
      } catch (err) {
        log.warn(err, "warehouse: shipment not read for the customs follow", { shipmentId: id });
        out.set(id, { ok: false, error: "The shipment could not be read" });
      }
    }
  };
  const all = Promise.all(Array.from({ length: Math.min(PARALLEL, shipmentIds.length) }, worker));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, budgetMs);
  });
  await Promise.race([all, timeout]);
  clearTimeout(timer);
  queue.length = 0; // nothing new starts after the budget
  return new Map(out);
}

/**
 * Brings the customs status of linked, unreleased records up to date with their shipments.
 * Only records not read within `maxAgeMs` (all of them with `force`), at most `limit`.
 * Returns the records it changed, as stored now.
 */
export async function followCustoms(
  rows: GateMovementRow[],
  companyId: string,
  opts: { maxAgeMs: number; limit: number; force?: boolean; budgetMs?: number },
): Promise<Map<string, GateMovementRecord>> {
  const changed = new Map<string, GateMovementRecord>();
  const now = Date.now();
  const due = rows
    .filter((m) => m.shipmentId && !m.impRelease && !m.leftAt)
    .filter((m) => opts.force || !m.shipmentCheckedAt || now - m.shipmentCheckedAt.getTime() >= opts.maxAgeMs)
    .sort((a, b) => (a.shipmentCheckedAt?.getTime() ?? 0) - (b.shipmentCheckedAt?.getTime() ?? 0))
    .slice(0, opts.limit);
  if (!due.length) return changed;

  const fetched = await fetchStatuses([...new Set(due.map((m) => m.shipmentId!))], opts.budgetMs ?? BUDGET_MS);
  const at = new Date();
  const checkedOnly: string[] = [];
  for (const m of due) {
    const f = fetched.get(m.shipmentId!);
    if (!f) continue; // not answered in time: read again next time
    if (!f.ok || !isCustomsStatus(f.customsStatus) || f.customsStatus === m.customsStatus) {
      checkedOnly.push(m.id);
      continue;
    }
    // Only while the status is still the one read and the record is not released, so a change
    // made at the gate meanwhile is not overwritten blindly.
    const row = await gateMovementRepository.conditionalUpdate(
      m.id,
      companyId,
      { customsStatus: f.customsStatus, releaseGates: setCustomsLineSql(customsLine(f.customsStatus)), shipmentCheckedAt: at },
      [{ kind: "customsFromShipment", label: `Customs status from shipment: ${f.customsStatus}`, at: at.toISOString(), by: "Shipments", detail: `was ${m.customsStatus}` }],
      sql`${t.customsStatus} = ${m.customsStatus} AND ${t.impRelease} IS NULL`,
    );
    if (row) changed.set(m.id, row);
    else checkedOnly.push(m.id);
  }
  try {
    await gateMovementRepository.markShipmentChecked(checkedOnly, companyId, at);
  } catch (err) {
    log.warn("warehouse: could not record the customs follow check", { error: String(err) });
  }
  return changed;
}
