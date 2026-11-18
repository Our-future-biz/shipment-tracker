import type { CutoffDismissed } from "../lib/cutoffDismissals";
import { shipmentCutoffDismissalRepository as dismissals } from "../repositories/shipmentCutoffDismissal.repository";

// The read both pages share. Kept apart from the writes (services/cutoffDismissalActions.service), so the
// services that only read - Needs Attention, Shipments → Managers - load nothing but the repository.

/** What the pages show after "Not known right now:" when the dismissals could not be read: nothing is then treated as dismissed. */
export const DISMISSALS_NOT_KNOWN = "dismissed cut-offs";

/**
 * The live dismissals of these jobs, by shipment id: what Shipments → Managers and the Shipments
 * list's Needs Attention hand to lib/cutoffDismissals withoutDismissed. One query; a job with none
 * has no entry. It throws when the read fails: the caller then treats nothing as dismissed and
 * names DISMISSALS_NOT_KNOWN (D29).
 */
export async function cutoffDismissalsOf(companyId: string, shipmentIds: readonly string[]): Promise<Map<string, CutoffDismissed[]>> {
  const byJob = new Map<string, CutoffDismissed[]>();
  for (const row of await dismissals.liveByShipmentIds(shipmentIds, companyId)) {
    const list = byJob.get(row.shipmentId);
    const entry = { cutoff: row.cutoff, date: row.cutoffDate };
    if (list) list.push(entry);
    else byJob.set(row.shipmentId, [entry]);
  }
  return byJob;
}
