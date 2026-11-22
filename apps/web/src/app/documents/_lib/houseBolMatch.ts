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
