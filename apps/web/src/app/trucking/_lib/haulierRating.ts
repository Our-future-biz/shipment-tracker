import type { HaulierListItem } from "@/hooks/useTrucking";

// A haulier's rating where a haulier is picked (Council Outlay 7, step 5). Lists people pick from by name
// go best first; lists ranked by price keep their order and only show the stars (D13). The rating is
// advice, never a block: a 0-star haulier is confirmed, not refused (D15).

/** The order of "best first" (D14): 5 down to 1 star, then not rated, then 0 (known to be the worst). */
export const ratingRank = (rating: number | null | undefined): number => (rating == null ? 0.5 : rating === 0 ? -1 : rating);

/** Hauliers best first, then by name. */
export function bestFirst<H extends Pick<HaulierListItem, "companyName" | "rating">>(hauliers: readonly H[]): H[] {
  return [...hauliers].sort((a, b) => ratingRank(b.rating) - ratingRank(a.rating) || a.companyName.localeCompare(b.companyName, "cs"));
}

/** Each haulier's rating by its id, for rows that name a haulier by id (priced candidates, trips). */
export const ratingsOf = (hauliers: readonly HaulierListItem[]): Map<string, number | null> => new Map(hauliers.map((h) => [h.customerId, h.rating]));

/** Whether picking this haulier needs a word that it is low rated: 2 stars or fewer. */
export const lowRated = (rating: number | null | undefined): rating is number => rating != null && rating <= 2;

/** Whether picking it needs a confirmation: 0 stars, "do not use". */
export const needsConfirmation = (rating: number | null | undefined): boolean => rating === 0;
