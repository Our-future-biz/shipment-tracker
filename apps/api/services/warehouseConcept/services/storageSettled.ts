import type { GateEvent, GateReleaseLine } from "../schemas/gateMovement.schema";
import { isDomestic } from "./direction";
import { movementStorage, type StorageMovement } from "./storage";

// "Storage settled" goes back to Pending once storage is charged (Council Outlay 5, decision 19).
// The line is born OK for LCL and Domestic cargo, so cargo past its free days could leave with
// the storage never settled. When the storage clock of outbound cargo still here turns Chargeable
// and nobody has ticked the line by hand, it is set to Pending (logged), as the Customs line
// follows the customs status. A person's tick (OK or back to Pending) always stands. Pure (tested
// in tests/storageSettled.test.ts); the write is storageSettled.service.ts.

export const STORAGE_SETTLED_GATE = "Storage settled";
export const STORAGE_REOPENED_EVENT = "storageSettledReopened";
export const STORAGE_REOPENED_NOTE = "storage chargeable — settle it before the release";

export type StorageLineRecord = StorageMovement & {
  visit: string;
  handling?: string | null;
  impRelease: Date | null;
  leftAt: Date | null;
  releaseGates: GateReleaseLine[];
  events: GateEvent[];
};

/** A person ticked the "Storage settled" line (OK or back to Pending) at some point. */
const tickedByHand = (events: GateEvent[]) => events.some((e) => e.kind === "releaseGate" && e.label.startsWith(`${STORAGE_SETTLED_GATE}:`));

/** The record's "Storage settled" line is to go back to Pending now. */
export function storageLineToReopen(m: StorageLineRecord, now = new Date()): boolean {
  if (m.impRelease || m.leftAt) return false;
  // Inbound cargo has no WH release: its release gates are not used.
  if (m.visit !== "výdej" && !isDomestic(m.handling)) return false;
  const line = m.releaseGates.find((g) => g.g === STORAGE_SETTLED_GATE);
  if (!line || line.s !== "OK") return false;
  if (tickedByHand(m.events) || m.events.some((e) => e.kind === STORAGE_REOPENED_EVENT)) return false;
  return movementStorage(m, now).state === "Chargeable";
}

/** The release gates with the "Storage settled" line back to Pending. */
export const reopenedGates = (gates: GateReleaseLine[]): GateReleaseLine[] =>
  gates.map((g) => (g.g === STORAGE_SETTLED_GATE ? { ...g, s: "Pending" as const, note: STORAGE_REOPENED_NOTE } : g));
