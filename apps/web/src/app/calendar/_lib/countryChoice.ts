// What the user's "My countries" choice means on the year calendar and the Public Holidays page
// (mock council R21). Both pages read it the same way, so they show the same countries.
//
// The choice is kept on the user's account as a list of country names (the holidays service keeps
// any name). Two names that are no country's mark a choice that is not a list of countries: "every
// country", and "no other country" (the Czech holidays only). An empty list is a user who never
// picked: they see the company's countries, else Germany (user council M19). Before the marks, a
// user who removed the last country saved an empty list and got that default straight back, so
// "Czech holidays only" or "all countries" could not be chosen.

/** Kept for "every country". Starts with "*", which no country's name does. */
export const ALL_COUNTRIES_MARK = "*all countries";
/** Kept for "no other country": the Czech holidays only. */
export const NO_OTHER_COUNTRY_MARK = "*no other country";

const isMark = (name: string) => name === ALL_COUNTRIES_MARK || name === NO_OTHER_COUNTRY_MARK;

export type CountryChoice =
  /** Never picked: the default countries, shown as if picked. */
  | { kind: "default"; countries: string[] }
  | { kind: "picked"; countries: string[] }
  | { kind: "all" }
  /** No country besides the Czech Republic. */
  | { kind: "none" };

/** The user's choice out of what is kept on their account; `fallback` is the default countries (defaultCountries). */
export function countryChoice(stored: readonly string[], fallback: readonly string[]): CountryChoice {
  if (stored.includes(ALL_COUNTRIES_MARK)) return { kind: "all" };
  const countries = stored.filter((c) => !isMark(c));
  if (countries.length) return { kind: "picked", countries };
  if (stored.includes(NO_OTHER_COUNTRY_MARK)) return { kind: "none" };
  return { kind: "default", countries: [...fallback] };
}

/** The countries whose holidays show: null for every country, [] for none besides the Czech Republic. */
export function chosenCountries(choice: CountryChoice): string[] | null {
  if (choice.kind === "all") return null;
  if (choice.kind === "none") return [];
  return choice.countries;
}

/** A country picker's value: the countries, or the "All countries" option for every country. */
export function pickerValue(choice: CountryChoice): string[] {
  return choice.kind === "all" ? [ALL_COUNTRIES_MARK] : (chosenCountries(choice) ?? []);
}

/**
 * What to keep after a change in a country picker that offers "All countries" (its value is
 * ALL_COUNTRIES_MARK) beside `offered` countries. "All countries" just picked replaces the countries;
 * a country picked while "All countries" was on replaces it. Nothing left is kept as "no other
 * country", never as the empty list that would bring the default back. The kept picks the picker
 * does not offer (a Czech row picked on the Public Holidays page, a country no longer listed) stay.
 */
export function keptAfterPick(stored: readonly string[], offered: readonly string[], before: readonly string[], picked: readonly string[]): string[] {
  if (picked.includes(ALL_COUNTRIES_MARK) && !before.includes(ALL_COUNTRIES_MARK)) return [ALL_COUNTRIES_MARK];
  const countries = picked.filter((c) => !isMark(c));
  const unoffered = stored.filter((c) => !isMark(c) && !offered.includes(c));
  const kept = [...unoffered, ...countries];
  return kept.length ? kept : [NO_OTHER_COUNTRY_MARK];
}

/**
 * What to keep after a pick made on a picker last drawn with `shown`, applied to `latest` - the list
 * as the picks before it left it, which the page may not have drawn yet. Quick picks each built on
 * the drawn list, so a later one dropped the earlier ones (mock test S18-100): what this pick added
 * and took out, against what it was made on, is applied to the latest list instead. Only what the
 * picker offers (and "All countries") is read off it; keptAfterPick keeps the rest.
 */
export function keptAfterQuickPick(latest: readonly string[], fallback: readonly string[], offered: readonly string[], shown: readonly string[], next: readonly string[]): string[] {
  const current = pickerValue(countryChoice(latest, fallback));
  const inPicker = (c: string) => c === ALL_COUNTRIES_MARK || offered.includes(c);
  const added = next.filter((c) => inPicker(c) && !shown.includes(c) && !current.includes(c));
  const removed = shown.filter((c) => inPicker(c) && !next.includes(c));
  const picked = [...current.filter((c) => inPicker(c) && !removed.includes(c)), ...added];
  return keptAfterPick(latest, offered, current, picked);
}

/** What a picker says when it holds no country. */
export function pickerPlaceholder(choice: CountryChoice): string {
  return choice.kind === "none" ? "No other country: Czech holidays only" : "My countries";
}
