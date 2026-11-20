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

/** Customs modes of goods that leave under a transit document. */
export const TRANSIT_MODES: readonly string[] = ["T1", "T2L"];

/**
 * The blanks an MRN is trimmed of: every character JavaScript's trim() takes off (spaces, tabs, line
 * breaks, the no-break and other Unicode spaces, the BOM). The release's SQL twin (gateMovement
 * service, transitPassesSql) trims the stored MRN of exactly these, so the screens and the WH
 * release agree on whether an MRN is recorded (review of mock council C1).
 */
export const MRN_BLANKS = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

const trimBlanks = (v: string): string => {
  let from = 0;
  let to = v.length;
  while (from < to && MRN_BLANKS.includes(v[from])) from++;
  while (to > from && MRN_BLANKS.includes(v[to - 1])) to--;
  return v.slice(from, to);
};

/** An MRN is recorded on the position ("—" is the screens' empty value). */
export const mrnRecorded = (mrn: string | null | undefined): boolean => {
  const v = trimBlanks(mrn ?? "");
  return v !== "" && v !== "—";
};

/** What the release reads besides the gates to apply the transit rule. */
export interface TransitInputs {
  visit?: string | null;
  customsMode?: string | null;
  mrn?: string | null;
}

/**
 * Outbound cargo (výdej) under transit (T1 / T2L) with an MRN recorded leaves under its transit
 * document: its Customs line passes the WH release though customs did not clear it here. The same
 * rule the export container gate-out applies (Council Outlay 5, decision 16: "the MRN, not customs
 * clearance"); mock council C1, owner's answer R27 (20 Nov 2026). It is not an override: the override
 * still never clears Customs (Q18 (b)), and without the MRN the Customs line holds as before.
 */
export const transitPassesCustoms = (m: TransitInputs): boolean =>
  m.visit === "výdej" && TRANSIT_MODES.includes(m.customsMode ?? "") && mrnRecorded(m.mrn);

/** The Customs line's note while the transit rule passes it. */
export const transitCustomsNote = (customsMode: string | null | undefined) => `${customsMode || "T1"} transit — MRN recorded, leaves under its transit document`;

/**
 * The release gates as the WH release reads them: the stored ones, with a Customs line not OK shown
 * OK while transitPassesCustoms holds (the stored line still follows the customs status). Every
 * check of the release (isArmed, the WH release stamp, the screens and the managers' cockpit) reads
 * these, so one rule holds everywhere.
 */
export function releaseGatesFor<G extends { g: string; s: string; note?: string }>(m: TransitInputs, gates: G[]): G[] {
  if (!transitPassesCustoms(m)) return gates;
  return gates.map((x) => (x.g === CUSTOMS_GATE && x.s !== "OK" ? ({ ...x, s: "OK", note: transitCustomsNote(m.customsMode) } as G) : x));
}

/**
 * An override event made under this rule carries `customsKept: true`, so the managers' count of
 * "overrides past Customs" keeps the old ones (made when an override still passed Customs) and
 * never counts a new one.
 */
export type OverrideEvent = GateEvent & { customsKept?: boolean };
