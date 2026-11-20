// The job page's rows in the words of the job's freight mode (user council O17, owner's answer Q8):
// an air job names its documents, flight and airports as air freight does, and leaves out the rows
// only sea freight has. A row left out on air that already holds a value stays, under its sea name,
// so nothing typed disappears; switched back to sea, the job shows every row again. The grid's column
// titles and History's field names stay generic (columnConfig). Pure.

import { isAirFreight } from "@/lib/chargeBasis";

/** An air job's names for rows whose sea name says Vessel, BoL or Port. */
export const AIR_LABELS: Readonly<Record<string, string>> = {
  vessel: "Flight",
  houseBolNumber: "HAWB Number",
  houseBolType: "HAWB Type",
  masterBolNumber: "MAWB Number",
  masterBolType: "MAWB Type",
  pol: "Airport of Departure",
  pod: "Airport of Destination",
  // The carrier of an air job is an airline.
  shippingLine: "Airline / Coloader",
  bolDraft: "AWB Draft",
};

/**
 * Rows only sea freight has, left out of an air job while they are empty: the voyage (the flight
 * says it), the container and its TEU, and the VGM (a SOLAS rule for containers) with the VGM and SI
 * closings. Compliance's Shipping Instructions stay: an air shipper gives instructions too (SLI).
 */
export const AIR_HIDDEN: ReadonlySet<string> = new Set(["voyage", "containerNumber", "containerTypeSummary", "totalTeu", "vgmClosing", "siClosing", "vgm"]);

/**
 * The value a sea-only row starts with before anyone touches it (the server's starting states,
 * fieldDefaults): on an air job it counts as empty, so the row is still left out (step 3 review M1).
 * Air jobs made before the server stopped seeding the VGM on air still hold it.
 */
const AIR_UNTOUCHED: Readonly<Record<string, string>> = { vgm: "Pending (Red)" };

/** Whether a sea-only row holds a value of its own on an air job: not blank, not its untouched starting value. */
const holdsValue = (key: string, value: string | null | undefined): boolean => {
  const text = (value ?? "").trim();
  return !!text && text !== AIR_UNTOUCHED[key];
};

/**
 * The rows of a card as the job's freight mode shows them, in the card's order: on an air job the
 * air names, and the sea-only rows left out unless `valueOf` gives them a value (their untouched
 * starting value is none). Any other mode keeps
 * the rows as they are. Used for the card and its "Show all" / field picker alike.
 */
export function fieldsForMode<F extends { key: string; label: string }>(
  fields: readonly F[],
  freightMode: string | null | undefined,
  valueOf: (key: string) => string | null | undefined,
): F[] {
  if (!isAirFreight(freightMode)) return [...fields];
  return fields.flatMap((f) => {
    if (AIR_HIDDEN.has(f.key)) return holdsValue(f.key, valueOf(f.key)) ? [f] : [];
    const label = AIR_LABELS[f.key];
    return label ? [{ ...f, label }] : [f];
  });
}

/** The Carrier card's title: an air job's transport document is the air waybill. */
export const carrierCardTitle = (freightMode: string | null | undefined): string =>
  isAirFreight(freightMode) ? "Carrier & Air Waybill" : "Carrier & Bill of Lading";

/**
 * Whether the job shows its Container Details tab: always, but on an air job only once it has a
 * container (or a container number), so one entered before the mode changed can still be reached.
 */
export function showsContainerTab(freightMode: string | null | undefined, containerCount: number, containerNumber?: string | null): boolean {
  return !isAirFreight(freightMode) || containerCount > 0 || !!(containerNumber ?? "").trim();
}
