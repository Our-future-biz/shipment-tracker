import type { WarehouseGateStampedEvent } from "../topics";

// Which `warehouse-gate-stamped` events a stamp or a void owes. Pure (no database, no Encore).

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
