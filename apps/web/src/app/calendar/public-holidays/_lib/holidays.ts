import dayjs from "dayjs";
import type { interfaces } from "@/lib/api/client";

export type HolidayItem = interfaces.HolidayItem;
export type HolidayRow = interfaces.HolidayRowInput;

// One dated holiday of a row: a row can hold a national holiday, a regional one, or both.
export interface Occurrence {
  key: string;
  id: string;
  country: string;
  countryCode: string;
  kind: "National" | "Regional";
  name: string;
  start: string; // yyyy-mm-dd
  end: string;
  regions: string;
}

export function occurrences(items: HolidayItem[]): Occurrence[] {
  const out: Occurrence[] = [];
  for (const h of items) {
    if (h.nationalHoliday && h.nationalStart) {
      out.push({
        key: `${h.id}-n`, id: h.id, country: h.country, countryCode: h.countryCode, kind: "National",
        name: h.nationalHoliday, start: h.nationalStart, end: h.nationalEnd || h.nationalStart, regions: "",
      });
    }
    if (h.regionalHoliday && h.regionalStart) {
      out.push({
        key: `${h.id}-r`, id: h.id, country: h.country, countryCode: h.countryCode, kind: "Regional",
        name: h.regionalHoliday, start: h.regionalStart, end: h.regionalEnd || h.regionalStart, regions: h.regions,
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.country.localeCompare(b.country));
}

// Holidays that touch the period from..to (yyyy-mm-dd, inclusive).
export const overlaps = (o: { start: string; end: string }, from: string, to: string) => o.start <= to && o.end >= from;

export const todayIso = () => dayjs().format("YYYY-MM-DD");

// Monday..Sunday of the current week.
export function thisWeek(): { from: string; to: string } {
  const d = dayjs();
  const monday = d.subtract((d.day() + 6) % 7, "day");
  return { from: monday.format("YYYY-MM-DD"), to: monday.add(6, "day").format("YYYY-MM-DD") };
}
