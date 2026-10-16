import type { WarehouseGateStampedEvent } from "../topics";
import type { GateTransportLeg } from "../schemas/gateMovement.schema";
import { fromTrip, PICKUP_RUN } from "./tripSource";

// Which `warehouse-gate-stamped` events a stamp or a void owes. Pure (no database, no Encore).
//
//   arrival (gateIn)    the gate-in of cargo that comes into our hub: inbound cargo (příjem), or —
//                       decided by the TRIP, not by the visit — cargo whose IN leg is a Trucking
//                       pick-up run delivering to the hub (an LTL consignment on an Import job is
//                       an outbound position, yet its pick-up run brings it in). Its gate-in starts
//                       Trucking's D+N clock. An outbound gate-in without such a trip is the
//                       truck that picks the cargo up: nothing is published.
//   departure (gateOut) the cargo leaves: the WH release (it stamps the gate-out too) on any
//                       position, or the gate-out of outbound cargo. An inbound gate-out of its own
//                       is the delivering truck leaving — the cargo stays, whatever trip brought it.
//   void / archive      a voided step is told ("voided") exactly when its stamp was told: built
//                       from these same rules, never from the columns a void happens to clear.

type ArrivalFields = { visit: string; transportLegs?: GateTransportLeg[] | null };
type StampFields = { gateIn: Date | null; gateOut: Date | null; impRelease: Date | null };

/** The IN leg was filled by a Trucking pick-up run (a trip that delivers the cargo to our hub). */
export function arrivesOnPickupRun(m: Pick<ArrivalFields, "transportLegs">): boolean {
  const leg = (m.transportLegs ?? []).find((l) => l.leg === "IN");
  // expect-arrival is called only for pick-up runs; a marker made before the kind was kept is one.
  return !!leg && fromTrip(leg) && (leg.source!.tripKind ?? PICKUP_RUN) === PICKUP_RUN;
}

/** The gate-in is the cargo arriving at our hub (published as gateIn). */
export const gateInIsArrival = (m: ArrivalFields): boolean => m.visit !== "výdej" || arrivesOnPickupRun(m);

/** The cargo leaves the warehouse with this stamp (published as gateOut). */
export const stampDeparts = (m: Pick<ArrivalFields, "visit">, kind: string): boolean => kind === "impRelease" || (kind === "gateOut" && m.visit === "výdej");

/**
 * What voiding the stamp `kind` takes back from Trucking: what that stamp published. A voided WH
 * release always takes back its gateOut — also when the gate-out column stays (an export truck's
 * own gate-out stamped earlier).
 */
export function voidedSteps(m: ArrivalFields, kind: string): { gateIn: boolean; gateOut: boolean } {
  return { gateIn: kind === "gateIn" && gateInIsArrival(m), gateOut: stampDeparts(m, kind) };
}

/** Every step a record's stamps published (archiving the record, or removing its position, takes each back). */
export function publishedSteps(m: ArrivalFields & StampFields): { gateIn: boolean; gateOut: boolean } {
  return { gateIn: !!m.gateIn && gateInIsArrival(m), gateOut: !!m.impRelease || (m.visit === "výdej" && !!m.gateOut) };
}

/** What one committed change did to a gate record's gate-in / gate-out columns. */
export interface GateStampedChange {
  companyId: string;
  movementId: string;
  /** The position (warehouse task); without one, nothing is published. */
  positionId: string | null;
  wczRef: string;
  shipmentId: string | null;
  userId: string;
  /** The stamp clicked (gateIn, gateOut, impRelease, expDraft, expReceipt) or voided. */
  stampKind: string;
  /** The time of the stamp (or of the void). */
  at: Date;
  /** Columns this change set: gate-in and / or gate-out. */
  stamped?: { gateIn?: boolean; gateOut?: boolean };
  /** Columns this change voided. */
  voided?: { gateIn?: boolean; gateOut?: boolean };
}

export function gateStampedEvents(c: GateStampedChange): WarehouseGateStampedEvent[] {
  if (!c.positionId) return [];
  const base = { companyId: c.companyId, shipmentId: c.shipmentId, positionId: c.positionId, wczRef: c.wczRef, at: c.at.toISOString(), userId: c.userId };
  const out: WarehouseGateStampedEvent[] = [];
  if (c.stamped?.gateIn) out.push({ ...base, kind: "gateIn", stampKind: c.stampKind });
  if (c.stamped?.gateOut) out.push({ ...base, kind: "gateOut", stampKind: c.stampKind });
  // A void names the column it cleared (the WH release void also clears the gate-out it stamped).
  if (c.voided?.gateOut) out.push({ ...base, kind: "voided", stampKind: "gateOut" });
  if (c.voided?.gateIn) out.push({ ...base, kind: "voided", stampKind: "gateIn" });
  return out;
}
