// A Co-Loading sailing's Master Job (Council Outlay 14, C2, D16: one Master Job per sailing): made
// from the sailing with its shipments, or an existing one linked. The Master Job's own code copies
// its fields onto its shipments and carries the tracking; the sailing only remembers which one is
// its own, and shows its Master B/L, container numbers and seals. Pure.

import { sailingWeek } from "./coLoadingSailing";

export interface MasterJobShipment {
  shipmentId: string;
  jobNumber: string;
  customer: string;
  /** The Master Job the shipment is in; null when it is in none. */
  masterJobId: string | null;
}

export interface SailingMasterJobRow {
  shipmentId: string;
  jobNumber: string;
  customer: string;
  /** "on": in the sailing's Master Job. "other": in another Master Job. "none": in no Master Job. */
  place: "on" | "other" | "none";
}

/** The sailing's shipments beside its Master Job, by job number. With no Master Job (null) none is "on". */
export function masterJobRows(shipments: readonly MasterJobShipment[], masterJobId: string | null): SailingMasterJobRow[] {
  return shipments
    .map((s): SailingMasterJobRow => ({ shipmentId: s.shipmentId, jobNumber: s.jobNumber, customer: s.customer, place: s.masterJobId ? (s.masterJobId === masterJobId ? "on" : "other") : "none" }))
    .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
}

/**
 * Why these shipments cannot be put on the sailing's Master Job, or null: each must be on the
 * sailing, and one in another Master Job is first taken off that one by hand - moving it would
 * take the other Master Job's containers and cost shares from it without anybody asking.
 */
export function putOnRefusal(shipmentIds: readonly string[], rows: readonly SailingMasterJobRow[]): string | null {
  if (shipmentIds.length === 0) return "Tick the shipments to put on the Master Job.";
  const picked = shipmentIds.map((id) => rows.find((r) => r.shipmentId === id));
  if (picked.some((r) => !r)) return "A ticked shipment is no longer on this sailing: read the list again.";
  const other = picked.filter((r) => r!.place === "other").map((r) => r!.jobNumber);
  if (other.length > 0) return `${other.join(", ")} ${other.length === 1 ? "is" : "are"} in another Master Job: take ${other.length === 1 ? "it" : "them"} off that one first.`;
  return null;
}

export interface MasterJobFacts {
  vessel: string;
  voyage: string;
  estimatedDeparture: string | null;
  closingDate: string | null;
}

/**
 * What a Master Job made from a sailing takes from it: the vessel and voyage (not a week, which
 * names no vessel), the departure date as its ETD and the cut-off as its Closing Date - the four
 * facts "Copy to shipments" writes - and only where the Master Job has none of its own. The vessel
 * and the voyage go as a pair, only to a Master Job that has neither: the shipments' vessel with
 * the sailing's voyage would name a voyage of another ship, and the Master Job writes the pair onto
 * every house. The ports and the HUB are not taken: a Master Job writes them onto every shipment,
 * and a shipment's own may rightly differ.
 */
export function factsForMasterJob(sailing: { vessel: string; voyage: string; departureDate: string | null; cutoffDate: string | null }, has: MasterJobFacts): Partial<MasterJobFacts> {
  const named = sailingWeek(sailing.vessel) === null;
  const out: Partial<MasterJobFacts> = {};
  if (named && sailing.vessel && !has.vessel.trim() && !has.voyage.trim()) {
    out.vessel = sailing.vessel;
    if (sailing.voyage) out.voyage = sailing.voyage;
  }
  if (sailing.departureDate && !has.estimatedDeparture) out.estimatedDeparture = sailing.departureDate;
  if (sailing.cutoffDate && !has.closingDate) out.closingDate = sailing.cutoffDate;
  return out;
}
