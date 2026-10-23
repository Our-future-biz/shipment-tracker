import type { GateEvent } from "../schemas/gateMovement.schema";
import type { GateCorrectionNeeded } from "../interfaces/gate.interfaces";

// "Shipment may need correcting" and its Dismiss — pure, from the record's history (no import
// from the services: no import cycle). A stamp voided after its update reached the shipment leaves
// the shipment with a date the warehouse took back; it stays open until someone who corrected it
// in Shipments dismisses it (logged).

export const CORRECTION_EVENT = "shipmentMayNeedCorrecting";
export const CORRECTION_DISMISSED_EVENT = "shipmentCorrectionDismissed";

/** The open "may need correcting" of a record (the latest one after the latest Dismiss), or null. */
export function correctionNeeded(events: GateEvent[] | null | undefined): GateCorrectionNeeded | null {
  const last = [...(events ?? [])].reverse().find((e) => e.kind === CORRECTION_EVENT || e.kind === CORRECTION_DISMISSED_EVENT);
  return last?.kind === CORRECTION_EVENT ? { at: last.at, detail: last.detail ?? "" } : null;
}

/** The history event of a write the phone discarded instead of sending (floor mode). */
export const FLOOR_WRITE_LOST_EVENT = "floorWriteLost";
