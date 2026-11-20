import type { GateEvent } from "../schemas/gateMovement.schema";

// A supervisor override never clears Customs (owner's answer Q18 (b), user council 20 Nov 2026).
// It clears the other release lines as before - B/L, the pick-up PIN, an open exception, payment
// and the rest - but a position whose Customs line is not OK stays held until customs clears it.
// Pure (no database, no Encore runtime).

export const CUSTOMS_GATE = "Customs";

export const HELD_BY_CUSTOMS =
  "Held by Customs — a supervisor override never clears the Customs line; the cargo is released once customs clears it";

/** The Customs line is there and not OK. */
export const customsHolds = (gates: { g: string; s: string }[]): boolean => gates.some((x) => x.g === CUSTOMS_GATE && x.s !== "OK");

/**
 * An override event made under this rule carries `customsKept: true`, so the managers' count of
 * "overrides past Customs" keeps the old ones (made when an override still passed Customs) and
 * never counts a new one.
 */
export type OverrideEvent = GateEvent & { customsKept?: boolean };
