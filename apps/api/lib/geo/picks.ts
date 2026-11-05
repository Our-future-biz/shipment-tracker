// A user's most picked places first: the location pickers list what a user picks most at the
// top (counted per user, auth service location_pick), the rest in the search's own order.

/** How often a user picked each code. */
export type PickCounts = ReadonlyMap<string, number>;

/**
 * The list with the codes picked most first, most picks first; codes picked as often (or never)
 * keep the order they came in. Done before a search cuts its list, so a favourite is never cut.
 */
export function byPicks<T>(list: readonly T[], codeOf: (item: T) => string, picks?: PickCounts): T[] {
  if (!picks || picks.size === 0) return [...list];
  return list
    .map((item, i) => ({ item, i, n: picks.get(codeOf(item)) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.item);
}

// The codes a picker stores: UN/LOCODE ("DEHAM"), IATA airport ("PVG"), ocean terminal
// ("DEHAMCTB") or inland terminal ("DE-IT116") - the code in brackets of a stored place
// (apps/web/src/lib/places.ts).
const PICK_CODE = /^(?:[A-Z]{2}[A-Z0-9]{3}(?:[A-Z0-9]{2,6})?|[A-Z]{3}|[A-Z]{2}-(?:DP|IT|RR)[0-9]{1,4})$/;

/** The code as stored, or null when it is no place, airport or terminal code. */
export function pickCode(code: string): string | null {
  const c = (code ?? "").trim().toUpperCase();
  return PICK_CODE.test(c) ? c : null;
}
