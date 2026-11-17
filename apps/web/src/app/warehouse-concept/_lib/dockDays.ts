import { czechHolidays, holidayKey } from "@/app/calendar/_lib/calendar";

// The days the docks take bookings: every day but a Czech public holiday, whatever weekday it falls
// on - the server refuses a slot then (warehouseRecords.service, lib/workingDays), as it never books
// a trip's slot on one. Weekends are not held back here: the server books them by hand too.

/** The Czech public holiday a day (YYYY-MM-DD) is, by name; null on any other day. */
export function dockHolidayName(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const y = Number(m[1]);
  return czechHolidays(y).get(holidayKey(y, Number(m[2]) - 1, Number(m[3]))) ?? null;
}

/** Why no slot can be booked on a day (the server's sentence), or null when the docks work then. */
export function dockDayRefusal(day: string): string | null {
  return dockHolidayName(day) ? `The docks do not work on ${day}, a Czech public holiday — pick another day` : null;
}
