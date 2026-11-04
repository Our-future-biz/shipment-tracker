// A supplier's 0–5 star rating, wherever a supplier is rated, listed or picked: the Customer Database,
// Trucking's haulier pickers and the supplier pickers on quotes and shipment costs. What each star means
// is shown where a manager rates, so stars mean the same for everyone (Council Outlay 7, D8). The server
// asks for a reason up to 2 stars (D7): those warn the next person.

export const REASON_REQUIRED_UP_TO = 2;

export const RATING_MEANINGS: readonly { stars: number; title: string; text: string }[] = [
  { stars: 0, title: "Do not use", text: "Do not use, or only under an open corrective action." },
  { stars: 1, title: "Last resort", text: "Serious failures; use only with a manager's agreement." },
  { stars: 2, title: "Use with caution", text: "Repeated delays or claims; prefer another supplier where there is one." },
  { stars: 3, title: "Acceptable", text: "Usable, with occasional delays, POD chasing or invoice corrections." },
  { stars: 4, title: "Reliable", text: "Rare, minor issues, solved without being chased." },
  { stars: 5, title: "First choice", text: "No service failures or claims of note in 12 months; POD and invoices clean." },
];

/** Whether a reason must go with this rating. */
export const reasonRequired = (rating: number | null): boolean => rating !== null && rating <= REASON_REQUIRED_UP_TO;

/**
 * The word under a low-rated pick (0–2 stars), in the scale's own words, so a picker says what the rating
 * means (Council Review 5, K10): red at 0, amber at 1–2. Null for a supplier rated higher or not at all.
 */
export function lowRatingNote(rating: number | null | undefined): { tone: "red" | "amber"; title: string; text: string } | null {
  if (rating == null || rating > REASON_REQUIRED_UP_TO) return null;
  const meaning = RATING_MEANINGS.find((m) => m.stars === rating);
  return meaning ? { tone: rating === 0 ? "red" : "amber", title: meaning.title, text: meaning.text } : null;
}

/** The order of "best first" (D14): 5 down to 1 star, then not rated, then 0 (known to be the worst). */
export const ratingRank = (rating: number | null | undefined): number => (rating == null ? 0.5 : rating === 0 ? -1 : rating);

/** Best first, then by name: the order of every list a supplier is picked from by name. */
export function sortBestFirst<T>(items: readonly T[], ratingOf: (item: T) => number | null | undefined, nameOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => ratingRank(ratingOf(b)) - ratingRank(ratingOf(a)) || nameOf(a).localeCompare(nameOf(b), "cs"));
}
