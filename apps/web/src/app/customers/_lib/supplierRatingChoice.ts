import { reasonRequired } from "@/lib/supplierRating";

// What the rating editor does as a manager moves the choice, kept out of the component so each rule is
// covered by a test. The saved rating and reason are what the company has now; the draft is the editor's.

export interface SavedRating {
  rating: number | null;
  reason: string;
}

/** Low (0–2 stars, a reason needed), high (3–5) or not rated. */
const band = (rating: number | null): "low" | "high" | "none" => (rating === null ? "none" : reasonRequired(rating) ? "low" : "high");

/**
 * The reason after the choice moves to `next`. The saved reason was written for the saved rating, so while
 * it is untouched it goes when the choice leaves that rating's band: a positive reason must not pass for a
 * downgrade (D7), nor a low rating's for an upgrade. Moving to another 0–2 rating asks for a new one too
 * (Council Review 5, m17). Back on the saved rating, an emptied reason comes back. A typed reason stays.
 */
export function reasonAfterChoice(saved: SavedRating, reason: string, next: number): string {
  if (next === saved.rating) return reason === "" ? saved.reason : reason;
  if (reason !== saved.reason) return reason;
  return band(next) !== band(saved.rating) || reasonRequired(next) ? "" : reason;
}

/**
 * Whether Save may be pressed: a choice, a reason where 0–2 stars need one, and a change. The same rating
 * with the same reason saved again would only add a row to the history.
 */
export function canSaveRating(saved: SavedRating, picked: number | null, reason: string): boolean {
  if (picked === null) return false;
  if (reasonRequired(picked) && !reason.trim()) return false;
  return picked !== saved.rating || reason.trim() !== saved.reason.trim();
}
