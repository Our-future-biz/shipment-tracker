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
 */
export function besideShipment(fields: readonly ExtractedField[], existingFor: (label: string) => string): ExtractedField[] {
  return fields.map((f) => {
    const existingValue = existingFor(f.column);
    const hasConflict = existingValue !== "" && existingValue !== f.extractedValue;
    return { ...f, existingValue, hasConflict, approved: hasConflict ? false : f.approved };
  });
}

// ─── The House B/L of the shipment written into (owner's answer 22 Nov) ─────────────────────────
// When the House B/L read is the shipment's own, the shipment keeps its Colli, Total Weight and Total
// Volume: the B/L's go to its Warehouse tab as the remeasurement (the warehouse's job section,
// remeasure_rows), compared there with the shipment's - unless the warehouse has remeasured lines of
// its own, which stay.

/** The read's figures that go to the Warehouse as the remeasurement, not onto the shipment. */
export const BL_FIGURES = ["PCS", "Total Weight In Tons", "Total Volume In CBM"] as const;

/** Whether two House B/L numbers are the same B/L (letters and digits, any case), both filled. */
export const sameHouseBol = (a: string | null | undefined, b: string | null | undefined): boolean => !!bolKey(a ?? "") && bolKey(a ?? "") === bolKey(b ?? "");

/**
 * The review's fields when the B/L is the shipment's own: its figures are new to the Warehouse, not
 * set against the shipment's, so they show as new and ticked (where the files gave one value).
 */
export function asRemeasurement(fields: readonly ExtractedField[]): ExtractedField[] {
  return fields.map((f) =>
    (BL_FIGURES as readonly string[]).includes(f.column) ? { ...f, existingValue: "", hasConflict: false, approved: f.choices ? f.approved : true } : f,
  );
}

/** The approved fields without the B/L's figures: what is written onto the shipment. */
export function withoutBlFigures(approved: Record<string, string>): Record<string, string> {
  const rest = { ...approved };
  for (const label of BL_FIGURES) delete rest[label];
  return rest;
}

// A figure as read: "1,500.5" or "1 500,5" or "30 PLTS" → its number; NaN when there is none.
const figure = (v: string | undefined) => {
  const t = (v ?? "").trim().replace(/\s/g, "");
  const n = /,\d{1,2}$/.test(t) && !t.includes(".") ? t.replace(",", ".") : t.replace(/,/g, "");
  const m = n.match(/^\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};
// A per-piece figure as stored: plain, at most `decimals` places, no trailing zeros.
const plain = (n: number, decimals: number) => (Number.isFinite(n) && n > 0 ? String(Number(n.toFixed(decimals))) : "");

/** A remeasured line as the Warehouse keeps it: numbers as text; a B/L's has no sizes, its volume per piece instead. */
export interface BlRemeasuredLine {
  pieces: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightPerPcKg: string;
  volumePerPcM3?: string;
}

/**
 * The B/L's Colli, Total Weight (tons) and Total Volume (m³) as one remeasured line: Qty the colli,
 * weight and volume per piece so its totals are the B/L's. Null when the B/L names no whole colli
 * above 0 (a line is counted by its pieces).
 */
export function blRemeasuredLine(approved: Record<string, string>): BlRemeasuredLine | null {
  const colli = figure(approved["PCS"]);
  if (!(colli > 0) || !Number.isInteger(colli)) return null;
  const kg = figure(approved["Total Weight In Tons"]) * 1000;
  const m3 = figure(approved["Total Volume In CBM"]);
  const line: BlRemeasuredLine = { pieces: String(colli), lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: plain(kg / colli, 6) };
  const volume = plain(m3 / colli, 7);
  return volume ? { ...line, volumePerPcM3: volume } : line;
}
