import { arrivesByLink } from "./addressFilters";
import { searchesAllFields } from "./allFieldsSearch";

// The Status and column filters the Shipments list remembers per user (a view on another page
// under its own key), so filtering survives leaving the page and coming back (ShipmentsTable).
// They are restored on a plain arrival and written whenever the user changes them - except on a
// page entered by a link that opens exactly what it names: there they are neither restored nor
// written over, so the link's filters never become the ones remembered.

/** What the list remembers: its Status bucket, its column filters and whether "My jobs" is on (_lib/myJobs). */
export interface RememberedFilters {
  status?: string;
  filters?: { key: string; value: string }[];
  mine?: boolean;
}

/**
 * Whether the list was entered by an address that opens exactly what it names: "Show all" from
 * the main search (what it found, as many as it counted), or - on the Shipments list itself, the
 * views (Warehouse) take no such links - one that names a tile or a filter of its own, such as a
 * tile of Shipments → Managers (the rows it counted, not fewer).
 */
export const keepsToItsAddress = (params: Pick<URLSearchParams, "get">, isView: boolean): boolean => searchesAllFields(params) || (!isView && arrivesByLink(params));

/**
 * What to remember once the user changes the Status or the column filters: the ones on screen
 * with the change. Nothing (null) while the page was entered by a link that keeps to its address:
 * what is on screen is the link's, and the entry remembered from before stays as it was for the
 * next plain arrival.
 */
export function rememberedAfter(
  current: RememberedFilters & Required<Pick<RememberedFilters, "status" | "filters">>,
  change: RememberedFilters,
  enteredByLink: boolean,
): RememberedFilters | null {
  return enteredByLink ? null : { ...current, ...change };
}
