import { occurrences, rowCountry, type HolidayItem } from "../public-holidays/_lib/holidays";
import { czechHolidays, holidayKey } from "./calendar";

// What the year calendar shows on a day: every country's holiday, so users see where to expect one
// (owner, 17 Nov 2026). The Czech national holidays are worked out here (lib calendar); the other
// countries' - national and regional - come from the company's World Holidays list (Calendar →
// Public Holidays). A Czech row in that list on a day the Czech calendar already has is not shown twice.

export const CZECH = { code: "CZ", name: "Czech Republic" } as const;

export interface DayHoliday {
  countryCode: string;
  country: string;
  name: string;
  kind: "National" | "Regional";
  /** The regions of a regional holiday, as the list gives them */
  regions: string;
}

/** A country's flag from its two-letter code ("" for anything else). */
export function flagOf(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** The country a holiday is in, as a filter and the tooltip name it: its name, else its code (as the list page names it). */
export const countryOf = (h: Pick<DayHoliday, "country" | "countryCode">) => rowCountry(h);

const isCzech = (code: string) => code.trim().toUpperCase() === CZECH.code;

/**
 * The holidays of each day of `year`, keyed as lib calendar's holidayKey (y-m-d, m 1-based): the
 * Czech ones first, then the list's by country. A holiday of several days is on each of them; only
 * the days in `year` are kept.
 */
export function yearHolidays(year: number, items: HolidayItem[]): Map<string, DayHoliday[]> {
  const days = new Map<string, DayHoliday[]>();
  const add = (k: string, h: DayHoliday) => days.set(k, [...(days.get(k) ?? []), h]);

  for (const [k, name] of czechHolidays(year)) add(k, { countryCode: CZECH.code, country: CZECH.name, name, kind: "National", regions: "" });

  for (const o of occurrences(items)) {
    const from = new Date(`${o.start}T00:00:00`);
    const to = new Date(`${o.end || o.start}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) continue;
    // Only the days in `year` are walked, so a typo end date years away costs nothing.
    const first = new Date(year, 0, 1);
    const last = new Date(year, 11, 31);
    const end = to > last ? last : to;
    for (let d = new Date(from < first ? first : from); d <= end; d.setDate(d.getDate() + 1)) {
      const k = holidayKey(year, d.getMonth(), d.getDate());
      // The Czech calendar names the national holiday already.
      if (isCzech(o.countryCode) && o.kind === "National" && days.get(k)?.some((h) => isCzech(h.countryCode) && h.kind === "National")) continue;
      add(k, { countryCode: o.countryCode.trim().toUpperCase(), country: o.country, name: o.name, kind: o.kind, regions: o.regions });
    }
  }

  for (const [k, list] of days) {
    days.set(
      k,
      [...list].sort((a, b) => Number(isCzech(b.countryCode)) - Number(isCzech(a.countryCode)) || countryOf(a).localeCompare(countryOf(b)) || a.name.localeCompare(b.name)),
    );
  }
  return days;
}

/** Whether the day is a Czech public holiday (shown red, as weekends). */
export const isCzechHoliday = (list: readonly DayHoliday[] | undefined) => !!list?.some((h) => isCzech(h.countryCode) && h.kind === "National");

/** The day's holidays in the countries picked (all when none is picked); the Czech ones always. */
export function shownHolidays(list: readonly DayHoliday[] | undefined, countries: readonly string[]): DayHoliday[] {
  if (!list) return [];
  if (!countries.length) return [...list];
  return list.filter((h) => isCzech(h.countryCode) || countries.includes(countryOf(h)));
}

/** The countries of the list, for the filter (the Czech Republic is always shown, so not offered). */
export function listCountries(items: HolidayItem[]): string[] {
  return [...new Set(items.filter((h) => !isCzech(h.countryCode)).map(rowCountry).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * The user's countries after a change in the calendar's picker. It offers only the list's other
 * countries, so the saved picks it does not offer (a Czech row picked on the Public Holidays page, a
 * country no longer listed) are kept, not dropped by an edit here.
 */
export function withUnofferedPicks(saved: readonly string[], offered: readonly string[], picked: readonly string[]): string[] {
  return [...saved.filter((c) => !offered.includes(c)), ...picked];
}
