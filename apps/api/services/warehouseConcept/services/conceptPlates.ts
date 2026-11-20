import type { GateTransportLeg } from "../schemas/gateMovement.schema";
import { releasePlate } from "./direction";
import { readPickup } from "./pickupPin";

// The License Plate a job with a Warehouse Concept position shows in Shipments (the grid's column
// and the Warehouse tab's Plate number; mock council C2). Its live pick-up is the Concept's (owner
// decision Q17), so the normal Warehouse's pick-up of that job is view only and may be stale: the
// plate the cargo left with at the WH release wins, then the Concept pick-up's plates. Pure (no
// database, no Encore runtime).

/** The plates of a stored Concept pick-up section, each once, in row order ("" when none). */
export function pickupRowPlates(data: unknown): string {
  return [...new Set(readPickup(data).rows.map((r) => r.licensePlate.trim()).filter(Boolean))].join(", ");
}

/** What the plate reads from a gate record linked to the job. */
export interface ReleasedRecord {
  visit: string;
  handling?: string | null;
  impRelease: Date | null;
  plate: string;
  transportLegs?: GateTransportLeg[] | null;
}

/**
 * The job's plate from the Concept: the plate of its latest WH release of outbound cargo (what the
 * release sent to the shipment), else the Concept pick-up's plates; "" when the Concept has none.
 */
export function conceptPlate(pickupData: unknown, records: ReleasedRecord[]): string {
  const released = records
    .filter((m) => m.visit === "výdej" && m.impRelease && releasePlate(m).trim())
    .sort((a, b) => b.impRelease!.getTime() - a.impRelease!.getTime());
  return released.length ? releasePlate(released[0]!).trim() : pickupRowPlates(pickupData);
}
