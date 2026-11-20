// What a charge is also called when somebody searches the quote's charge list for it. The
// catalogue names a charge one way ("Inland container haulage"); a sales rep types the word the
// trade uses for it ("pre-carriage", "trucking", "pick-up"), which found nothing (User Council
// S15). Only for the search: the list and the documents keep the catalogue's names.
const SEARCH_WORDS: Record<string, readonly string[]> = {
  inland_haulage: ["pre-carriage", "on-carriage", "carriage", "trucking", "truck", "pick-up", "pickup", "collection", "delivery", "drayage", "transport", "rail"],
  inland_collection: ["pre-carriage", "on-carriage", "carriage", "trucking", "truck", "pick-up", "pickup", "haulage", "transport"],
  bb_pre_carriage: ["trucking", "truck", "pick-up", "pickup", "haulage", "collection", "transport"],
  bb_on_carriage: ["trucking", "truck", "haulage", "delivery", "transport"],
  rail_pre_carriage: ["carriage", "trucking", "truck", "pick-up", "pickup", "haulage", "collection", "transport"],
  rail_on_carriage: ["carriage", "trucking", "truck", "haulage", "delivery", "transport"],
  road_freight: ["trucking", "truck", "haulage", "carriage", "transport"],
  tail_lift: ["truck", "pick-up", "pickup"],
};

// Hyphens, slashes and spaces are typed every which way ("pick up", "pick-up", "pickup").
const fold = (text: string) => text.toLowerCase().replace(/[\s\-/]+/g, "");

/** Whether a charge of the list matches what was typed: by its name, or by what it is also called. */
export function chargeMatches(typed: string, option?: { value?: unknown; label?: unknown }): boolean {
  const wanted = fold(typed);
  if (!wanted) return true;
  const label = typeof option?.label === "string" ? option.label : "";
  const words = typeof option?.value === "string" ? (SEARCH_WORDS[option.value] ?? []) : [];
  return [label, ...words].some((name) => fold(name).includes(wanted));
}
