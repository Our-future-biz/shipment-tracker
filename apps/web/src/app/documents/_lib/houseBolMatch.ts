import type { ExtractedField } from "./extraction";

// Documents → Shipments, "Create new shipment": before a reading creates a job, the server is asked whether a
// live shipment has the House B/L read already. When one has, the user is shown that shipment and approves it
// (the reading is written into it, as "Add to existing shipment") or creates a new job anyway.

export const HOUSE_BOL = "House BoL Number";

// A B/L number as two are compared (as the server's billOfLadingKey): letters and digits, upper case.
const bolKey = (ref: string | undefined) => (ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The House B/L the review holds (as read, or as the user edited it), trimmed; "" when none. */
export function houseBolOf(fields: readonly ExtractedField[]): string {
  return (fields.find((f) => f.column === HOUSE_BOL)?.extractedValue ?? "").trim();
}

/**
 * Whether the server is asked for the shipment of this House B/L before a new job is created: it has letters or
 * digits, and it is not the one the user already chose to create a new job for ("Create new job").
 */
export function asksHouseBol(houseBol: string, newJobChosenFor: string): boolean {
  const key = bolKey(houseBol);
  return !!key && key !== bolKey(newJobChosenFor);
}

/**
 * The review's fields set beside the values of the shipment they are now written into (the one approved as the
 * House B/L's): each field's value on file, and a field whose value on file differs is unticked to be looked at,
 * as a read into an existing shipment is reviewed. What the user ticked, edited or picked otherwise stays.
 * `ownBl`: the House B/L read is the shipment's own - the B/L's figures go to its Warehouse, not against its
 * values, so they keep the ticks they had (review of system-23); their values on file are kept all the same,
 * shown again should the House B/L be edited to another (afterHouseBolEdit).
 */
export function besideShipment(fields: readonly ExtractedField[], existingFor: (label: string) => string, ownBl = false): ExtractedField[] {
  return fields.map((f) => {
    const existingValue = existingFor(f.column);
    const hasConflict = existingValue !== "" && existingValue !== f.extractedValue;
    const keepsTick = ownBl && isBlFigure(f.column);
    return { ...f, existingValue, hasConflict, approved: hasConflict && !keepsTick ? false : f.approved };
  });
}

// ─── A House B/L on a shipment already, as the review holds it now (review of system-23) ─────────
// The shipment is shown, and answered, for the House B/L it was found for: one edited to another is not on it,
// so the card goes and Write asks the server again.

/** The shipment found for a House B/L: the House B/L it was asked for, and the shipment that has it. */
export interface HouseBolMatch<S> {
  houseBol: string;
  shipment: S;
}

/** Whether what was found or held for a House B/L (a match, a failed lookup) is still the review's: its House B/L is the one. */
export function matchStillShown(match: { houseBol: string } | null, fields: readonly ExtractedField[]): boolean {
  return !!match && sameHouseBol(match.houseBol, houseBolOf(fields));
}

/** What the server answered for a House B/L: the shipment that has it (null: none has it), or why it could not be asked. */
export type HouseBolLookup<S> = { shipment: S | null } | { error: string };

/** What Write does before a new job is created from the read. */
export type HouseBolOnWrite<S> =
  | { kind: "create" }
  | { kind: "match"; match: HouseBolMatch<S> }
  | { kind: "hold"; houseBol: string; error: string };

/**
 * Write's answer to a new job's House B/L as the server answered: a shipment has it - shown to approve or create
 * a new job anyway; none has it - the job is created; it could not be asked - the write is held, said with the
 * reason, until the user writes again or creates a new job anyway (a second shipment with the same House B/L is
 * never made behind a "could not check").
 */
export function houseBolOnWrite<S>(houseBol: string, lookup: HouseBolLookup<S>): HouseBolOnWrite<S> {
  if ("error" in lookup) return { kind: "hold", houseBol, error: lookup.error };
  return lookup.shipment ? { kind: "match", match: { houseBol, shipment: lookup.shipment } } : { kind: "create" };
}

// ─── The House B/L of the shipment written into (owner's answer 22 Nov) ─────────────────────────
// When the House B/L read is the shipment's own, the shipment keeps its Colli, Total Weight and Total
// Volume: the B/L's go to its Warehouse tab as its Bill Of Lading Details (the warehouse's job section,
// house_bl_figures), shown beside the warehouse's remeasured figures - never one of them. Worked out from the
// House B/L the review holds as it is shown and written, never kept in the review's fields: those keep the
// shipment's values, so a House B/L edited to another sets the figures against them again (review of system-23).

/** The read's figures that go to the Warehouse as Bill Of Lading Details, not onto the shipment. */
export const BL_FIGURES = ["PCS", "Total Weight In Tons", "Total Volume In CBM"] as const;

function isBlFigure(column: string): boolean {
  return (BL_FIGURES as readonly string[]).includes(column);
}

/** Whether two House B/L numbers are the same B/L (letters and digits, any case), both filled. */
export const sameHouseBol = (a: string | null | undefined, b: string | null | undefined): boolean => !!bolKey(a ?? "") && bolKey(a ?? "") === bolKey(b ?? "");

/**
 * The review's fields as shown when the B/L is the shipment's own: its figures are new to the Warehouse, not
 * set against the shipment's, so they show no value on file and no conflict. Their ticks stay as they are
 * (review of system-23: a figure the user unticked is never ticked for them).
 */
export function asBlDetails(fields: readonly ExtractedField[]): ExtractedField[] {
  return fields.map((f) => (isBlFigure(f.column) ? { ...f, existingValue: "", hasConflict: false } : f));
}

/** The review as shown and written into a shipment whose House B/L is `targetHouseBol`: asBlDetails while the House B/L read is its own. */
export function reviewedFields(fields: ExtractedField[], targetHouseBol: string | null | undefined): ExtractedField[] {
  return sameHouseBol(targetHouseBol, houseBolOf(fields)) ? asBlDetails(fields) : fields;
}

/**
 * The review after its House B/L was edited (`before` → `after`) while it is written into a shipment whose House
 * B/L is `targetHouseBol` (review of system-23): no longer the shipment's own, the B/L's figures are set against
 * the shipment's values again as besideShipment sets them - one that differs is unticked to be looked at - so
 * they never overwrite the shipment's unseen. Become its own, the ticks stay: the figures then go to its Warehouse.
 */
export function afterHouseBolEdit(before: readonly ExtractedField[], after: ExtractedField[], targetHouseBol: string | null | undefined): ExtractedField[] {
  if (!sameHouseBol(targetHouseBol, houseBolOf(before)) || sameHouseBol(targetHouseBol, houseBolOf(after))) return after;
  return after.map((f) => {
    if (!isBlFigure(f.column)) return f;
    const hasConflict = f.existingValue !== "" && f.existingValue !== f.extractedValue;
    return { ...f, hasConflict, approved: hasConflict ? false : f.approved };
  });
}

/**
 * Whether the shipment a read is written into (whose House B/L is `targetHouseBol`; a new job has none) gets the
 * B/L's figures as its Bill Of Lading Details, and whether they stay off the shipment (review of system-23): its own
 * House B/L - the details, and the shipment keeps its figures; a new job, or a shipment without a House B/L, the
 * read giving it its House B/L (ticked) - the details too, beside the figures written onto it as ever, so a
 * consolidation's Cargo Details have them. A shipment with another House B/L gets none: the read is set against it.
 */
export function blDetailsOf(
  targetHouseBol: string | null | undefined,
  readHouseBol: string,
  approved: Record<string, string>,
): { details: boolean; offShipment: boolean } {
  if (sameHouseBol(targetHouseBol, readHouseBol)) return { details: true, offShipment: true };
  const givesHouseBol = !bolKey(targetHouseBol ?? "") && sameHouseBol(approved[HOUSE_BOL], readHouseBol);
  return { details: givesHouseBol, offShipment: false };
}

/** The approved fields without the B/L's figures: what is written onto the shipment. */
export function withoutBlFigures(approved: Record<string, string>): Record<string, string> {
  const rest = { ...approved };
  for (const label of BL_FIGURES) delete rest[label];
  return rest;
}

// A figure as read: "1,500.5" or "1 500,5" or "30 PLTS" → its number; 0 when there is none.
const figure = (v: string | undefined) => {
  const t = (v ?? "").trim().replace(/\s/g, "");
  const n = /,\d{1,2}$/.test(t) && !t.includes(".") ? t.replace(",", ".") : t.replace(/,/g, "");
  const m = n.match(/^\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
};

/** The B/L's Colli, weight and volume as the Warehouse keeps them. */
export interface BlFigures {
  colli: number;
  weightKg: number;
  volumeCbm: number;
}

/** The B/L's figures as the Warehouse keeps them: Colli, kg (from the read tons) and m³; null when it gave none of them. */
export function blFigures(approved: Record<string, string>): BlFigures | null {
  const out = {
    colli: figure(approved["PCS"]),
    weightKg: Math.round(figure(approved["Total Weight In Tons"]) * 1000 * 10) / 10,
    volumeCbm: Math.round(figure(approved["Total Volume In CBM"]) * 1000) / 1000,
  };
  return out.colli || out.weightKg || out.volumeCbm ? out : null;
}

/**
 * The Bill Of Lading Details a read of House B/L `houseBol` saves over the ones saved (review of system-23): each
 * figure the read gives (ticked, a number); one it does not give keeps the saved one when that is of the same House
 * B/L - another House B/L starts afresh. Null when the read gives none of them.
 */
export function blFiguresOver(approved: Record<string, string>, saved: ({ houseBol: string } & BlFigures) | null, houseBol: string): BlFigures | null {
  const read = blFigures(approved);
  if (!read) return null;
  const kept = saved && sameHouseBol(saved.houseBol, houseBol) ? saved : null;
  return {
    colli: read.colli || kept?.colli || 0,
    weightKg: read.weightKg || kept?.weightKg || 0,
    volumeCbm: read.volumeCbm || kept?.volumeCbm || 0,
  };
}

/**
 * The success line of a read written into a shipment (review of system-23): the fields written onto the shipment
 * itself, never the B/L's figures that went to its Warehouse tab instead (said by their own message); when only
 * those were written, the Warehouse tab is named.
 */
export function shipmentWrittenTitle(fieldCount: number, jobNumber: string, blDetailsWritten: boolean): string {
  if (fieldCount > 0) return `${fieldCount} field${fieldCount !== 1 ? "s" : ""} written to ${jobNumber}`;
  return blDetailsWritten ? `Bill Of Lading Details written to ${jobNumber}'s Warehouse tab` : `Nothing written to ${jobNumber}`;
}
