import type { HaulierListItem } from "@/hooks/useTrucking";
import { SUPPLIER_NOT_IN_USE } from "@/app/customers/_lib/supplierStatus";
import { sortBestFirst } from "@/lib/supplierRating";

// A haulier's rating where a haulier is picked (Council Outlay 7, step 5). Lists people pick from by name
// go best first; lists ranked by price keep their order and only show the stars (D13). The rating is
// advice, never a block: a 0-star haulier is confirmed, not refused (D15).

// The rank is the Customer Database's; kept here for the lists that sort hauliers by it.
export { ratingRank } from "@/lib/supplierRating";

/** Hauliers best first, then by name. */
export function bestFirst<H extends Pick<HaulierListItem, "companyName" | "rating">>(hauliers: readonly H[]): H[] {
  return sortBestFirst(hauliers, (h) => h.rating, (h) => h.companyName);
}

/** Each haulier's rating by its id, for rows that name a haulier by id (priced candidates, trips). */
export const ratingsOf = (hauliers: readonly HaulierListItem[]): Map<string, number | null> => new Map(hauliers.map((h) => [h.customerId, h.rating]));

/** Whether picking it needs a confirmation: 0 stars, "do not use". */
export const needsConfirmation = (rating: number | null | undefined): boolean => rating === 0;

/**
 * The hauliers a picker offers: those in use (the Customer Database's "Not in use" ones are left out, D16),
 * keeping the one already picked so a saved trip or leg still shows it.
 */
export function pickable<H extends Pick<HaulierListItem, "customerId" | "inUse">>(hauliers: readonly H[], keep?: string | null): H[] {
  return hauliers.filter((h) => h.inUse || h.customerId === keep);
}

/** A haulier's name in a picker: one kept there though "Not in use" says so (D16). */
export const pickName = (h: Pick<HaulierListItem, "companyName" | "inUse">): string => (h.inUse ? h.companyName : `${h.companyName} · ${SUPPLIER_NOT_IN_USE}`);

/** The ids of the hauliers "Not in use", for rows that name a haulier by id (priced candidates). */
export const notInUseOf = (hauliers: readonly HaulierListItem[]): Set<string> => new Set(hauliers.filter((h) => !h.inUse).map((h) => h.customerId));

/** Each haulier's rating reason by its id, for the note under a picked one (K11). */
export const reasonsOf = (hauliers: readonly HaulierListItem[]): Map<string, string> => new Map(hauliers.map((h) => [h.customerId, h.ratingReason]));
