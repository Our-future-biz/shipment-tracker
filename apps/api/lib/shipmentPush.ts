// A person's change of a shipment reaches the copies Trucking and the warehouse gate keep of it
// (F6). Data flowed one way only - Trucking's and the gate's outboxes write the shipment as the app
// (appWrite) - so a date or plate changed on the shipment, by hand or through its master job, stayed
// behind there. The shipment's write now owes each side the fields that side keeps (an outbox row
// in Shipments), and each side takes a change only while it still holds the value the shipment had
// (its own user's later edit wins) and only in a state where it may still change. Pure.
//
// The fields, by both sides (only those the other side has):
// - Trucking: shipment.pickupDate ↔ consignment.pickupDate (the FTL trip's planned pick-up follows,
//   and the promised delivery is counted again - Trucking's own rules), shipment.plateNumber ↔ the
//   FTL trip's tractorPlate. Not pushed: plannedDeliveryDate (Trucking counts the promise from the
//   service level and sends it to the shipment), pickupTime (Trucking never sends it either).
// - Gate record: shipment.estimatedArrival ↔ eta (what "Refresh from shipment" copies), and
//   shipment.plateNumber ↔ plate. etaWarehouse has no field on the gate record.
// A write that came from Trucking or the gate (appWrite) owes nothing, so a change never loops.

export type PushedField = "pickupDate" | "plateNumber" | "estimatedArrival";
export type PushTarget = "trucking" | "warehouse";

/** A field's value before and after the shipment's write ("" for none). */
export interface FieldChange {
  from: string;
  to: string;
}

/** The changed fields a shipment write owes one side (a plain interface: Encore validates it on the internal calls). */
export interface ShipmentChanges {
  pickupDate?: FieldChange;
  plateNumber?: FieldChange;
  estimatedArrival?: FieldChange;
}

/** The shipment's fields each side keeps, by the shipment's names for them. */
export const PUSHED_FIELDS: Readonly<Record<PushTarget, readonly PushedField[]>> = {
  trucking: ["pickupDate", "plateNumber"],
  warehouse: ["estimatedArrival", "plateNumber"],
};

const value = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

/**
 * What a shipment write owes each side: of the fields `written`, those the side keeps whose value
 * the write changed, from what to what. A side with nothing changed is left out.
 */
export function pushesOwed(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  written: readonly string[],
): { target: PushTarget; changes: ShipmentChanges }[] {
  const out: { target: PushTarget; changes: ShipmentChanges }[] = [];
  for (const target of ["trucking", "warehouse"] as const) {
    const changes: ShipmentChanges = {};
    for (const field of PUSHED_FIELDS[target]) {
      if (!written.includes(field)) continue;
      const from = value(before[field]);
      const to = value(after[field]);
      if (from !== to) changes[field] = { from, to };
    }
    if (Object.keys(changes).length) out.push({ target, changes });
  }
  return out;
}

/** What the other side does with one change: take it, nothing (it holds it already), or keep its own. */
export type PushDecision = { kind: "apply"; to: string } | { kind: "same" } | { kind: "skip"; reason: string };

/** A plate as Trucking stores it: upper case, no spaces or dashes. */
export const plateKey = (plate: string): string => plate.toUpperCase().replace(/[\s-]+/g, "");

interface ConsignmentState {
  pickupDate: string;
  pickedUpAt: Date | null;
  gateInAt: Date | null;
  cancelledAt: Date | null;
}

/** A consignment's pick-up date when its job's moved: until the pick-up, while it still has the job's old date. */
export function consignmentPickupDecision(c: ConsignmentState, change: FieldChange): PushDecision {
  if (c.pickupDate === change.to) return { kind: "same" };
  if (c.cancelledAt) return { kind: "skip", reason: "the consignment is cancelled" };
  if (!change.to) return { kind: "skip", reason: "the job's pick-up date was cleared; a consignment always has one" };
  if (c.pickedUpAt || c.gateInAt) return { kind: "skip", reason: "the cargo is picked up already" };
  if (c.pickupDate !== change.from) return { kind: "skip", reason: `its pick-up date was changed in Trucking (${c.pickupDate})` };
  return { kind: "apply", to: change.to };
}

/** An FTL trip's tractor plate when its job's changed: until the pick-up, while the trip still has the job's old plate. */
export function tripPlateDecision(
  trip: { tractorPlate: string | null; cancelledAt: Date | null },
  c: Pick<ConsignmentState, "pickedUpAt" | "gateInAt">,
  change: FieldChange,
): PushDecision {
  const now = trip.tractorPlate ?? "";
  if (now === plateKey(change.to)) return { kind: "same" };
  if (trip.cancelledAt) return { kind: "skip", reason: "the trip is cancelled" };
  if (c.pickedUpAt || c.gateInAt) return { kind: "skip", reason: "the cargo is picked up already" };
  if (now !== plateKey(change.from)) return { kind: "skip", reason: `the trip's plate was changed in Trucking (${now || "none"})` };
  return { kind: "apply", to: plateKey(change.to) };
}

interface GateState {
  eta: string;
  plate: string;
  /** Any gate stamp (gate-in, gate-out, release, receipt…). */
  stamped: boolean;
  /** The record's vehicle comes from a Trucking trip that announced it (transport legs). */
  fromTrip: boolean;
}

/**
 * What a gate record takes of a shipment's change. The ETA follows as "Refresh from shipment"
 * copies it (stamped or not); the plate only before any stamp - then it is the vehicle the gate
 * saw - and not on a record a Trucking trip announced (its legs carry the trip's vehicle).
 */
export function gateDecisions(m: GateState, changes: ShipmentChanges): { eta?: PushDecision; plate?: PushDecision } {
  const out: { eta?: PushDecision; plate?: PushDecision } = {};
  const eta = changes.estimatedArrival;
  if (eta) {
    out.eta =
      m.eta === eta.to
        ? { kind: "same" }
        : m.eta !== eta.from
          ? { kind: "skip", reason: `its ETA was changed at the gate (${m.eta || "none"})` }
          : { kind: "apply", to: eta.to };
  }
  const plate = changes.plateNumber;
  if (plate) {
    out.plate =
      m.plate === plate.to
        ? { kind: "same" }
        : m.stamped
          ? { kind: "skip", reason: "the gate stamped the vehicle already" }
          : m.fromTrip
            ? { kind: "skip", reason: "its vehicle comes from its Trucking trip" }
            : m.plate !== plate.from
              ? { kind: "skip", reason: `its plate was changed at the gate (${m.plate || "none"})` }
              : { kind: "apply", to: plate.to };
  }
  return out;
}

/** The shipment changes as an outbox row carries them, checked (a row's JSON may be old). */
export function parseShipmentChanges(raw: unknown): ShipmentChanges {
  const out: ShipmentChanges = {};
  if (!raw || typeof raw !== "object") return out;
  for (const field of ["pickupDate", "plateNumber", "estimatedArrival"] as const) {
    const c = (raw as Record<string, unknown>)[field] as { from?: unknown; to?: unknown } | undefined;
    if (c && typeof c.from === "string" && typeof c.to === "string") out[field] = { from: c.from, to: c.to };
  }
  return out;
}
