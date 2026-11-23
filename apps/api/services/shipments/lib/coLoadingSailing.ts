// A Co-Loading Concept service's sailings: the vessel a service's cargo goes on, made with "Create new
// sailing" on the service's page. For an import whose vessel is not known yet, the Vessel is the week
// it sails ("WEEK 44"), and then the Voyage may be left out. Pure, so it is tested without the database.

/**
 * The container types a sailing takes: twins of the web's CONTAINER_TYPES (lib/cargo), size by size,
 * as a quote's and a shipment's containers are picked.
 */
export const SAILING_CONTAINER_TYPES = [
  "20' DC",
  "20' RF",
  "20' OT",
  "20' HOT",
  "20' FR",
  "40' DC",
  "40' HC",
  "40' HRF",
  "40' OT",
  "40' HOT",
  "40' FR",
  "40' HFR",
  "45' HQ",
] as const;

export const VESSEL_MAX = 100;
export const VOYAGE_MAX = 40;

// "WEEK 44", "week44", "Wk 44", "W44": a sailing week (1 to 53), written in any of these ways.
const WEEK = /^(?:week|wk|w)\.?\s*(\d{1,2})$/i;

/** The week a Vessel names, "WEEK 44", or null when it names a vessel. */
export function sailingWeek(vessel: string): string | null {
  const m = WEEK.exec(vessel.trim());
  if (!m) return null;
  const week = Number(m[1]);
  return week >= 1 && week <= 53 ? `WEEK ${week}` : null;
}

/** What a new sailing is made from, as typed in the form. */
export interface SailingInput {
  vessel: string;
  voyage?: string;
  pol: string;
  pod: string;
  hub: string;
  containerType: string;
}

/** A sailing as it is saved: every field trimmed, a week written "WEEK 44". */
export type SailingValues = Required<SailingInput>;

const tidy = (s: string | undefined) => (s ?? "").trim().replace(/\s+/g, " ");

/** The values to save, or what is wrong with the input, in words for the form. */
export function checkSailingInput(input: SailingInput): { values: SailingValues } | { error: string } {
  const typed = tidy(input.vessel);
  if (!typed) return { error: "Give the vessel, or the week it sails (WEEK 44)." };
  if (typed.length > VESSEL_MAX) return { error: `The vessel can be at most ${VESSEL_MAX} characters.` };
  const week = sailingWeek(typed);
  const voyage = tidy(input.voyage);
  // A vessel not known yet has no voyage either: only a named vessel needs one.
  if (!week && !voyage) return { error: "Give the voyage, or write the week in Vessel (WEEK 44) while the vessel is not known." };
  if (voyage.length > VOYAGE_MAX) return { error: `The voyage can be at most ${VOYAGE_MAX} characters.` };
  const pol = tidy(input.pol);
  if (!pol) return { error: "Give the Port of Loading." };
  const pod = tidy(input.pod);
  if (!pod) return { error: "Give the Port of Discharge." };
  const hub = tidy(input.hub);
  if (!hub) return { error: "Give the HUB." };
  const containerType = tidy(input.containerType);
  if (!(SAILING_CONTAINER_TYPES as readonly string[]).includes(containerType)) return { error: "Pick the container type." };
  return { values: { vessel: week ?? typed, voyage, pol, pod, hub, containerType } };
}
