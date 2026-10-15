// Czech working days: Monday to Friday, except the statutory public holidays. One calendar for
// the whole API (ČNB fixings, trucking lead times). Days are YYYY-MM-DD calendar days in Prague,
// like lib/businessDate.ts; pure functions, no I/O.
//
// `extraHolidays` adds further non-working days on top of the statutory ones, e.g. the national
// CZ days a company uploaded to the holidays service.
import { addDays, businessDay, businessMinutes } from "./businessDate";

// 0 = Sunday … 6 = Saturday.
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const d = weekday(date);
  return d === 0 || d === 6;
}

// Easter Sunday (Gregorian, anonymous algorithm).
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Czech public holidays with a fixed date (zákon 245/2000 Sb.), as MM-DD.
const FIXED_HOLIDAYS = ["01-01", "05-01", "05-08", "07-05", "07-06", "09-28", "10-28", "11-17", "12-24", "12-25", "12-26"];

/** Whether a day is a Czech statutory public holiday: the fixed dates, Good Friday and Easter Monday. */
export function isCzechHoliday(date: string): boolean {
  if (FIXED_HOLIDAYS.includes(date.slice(5))) return true;
  const easter = easterSunday(Number(date.slice(0, 4)));
  return date === addDays(easter, -2) || date === addDays(easter, 1); // Good Friday, Easter Monday
}

/** A weekday that is neither a Czech public holiday nor one of `extraHolidays`. */
export function isWorkingDay(date: string, extraHolidays: readonly string[] = []): boolean {
  return !isWeekend(date) && !isCzechHoliday(date) && !extraHolidays.includes(date);
}

/** The first working day after `date`. */
export function nextWorkingDay(date: string, extraHolidays: readonly string[] = []): string {
  let d = addDays(date, 1);
  while (!isWorkingDay(d, extraHolidays)) d = addDays(d, 1);
  return d;
}

/** The last working day before `date`. */
export function previousWorkingDay(date: string, extraHolidays: readonly string[] = []): string {
  let d = addDays(date, -1);
  while (!isWorkingDay(d, extraHolidays)) d = addDays(d, -1);
  return d;
}

/**
 * The day `n` working days after `date` (n ≥ 0). A non-working `date` first rolls forward to
 * the next working day and counting starts there: n = 0 is `date` itself when it is a working
 * day, else the next working day; Saturday + 1 is Tuesday.
 */
export function addWorkingDays(date: string, n: number, extraHolidays: readonly string[] = []): string {
  if (!Number.isInteger(n) || n < 0) throw new Error("Working days to add must be a whole number, 0 or more");
  let d = isWorkingDay(date, extraHolidays) ? date : nextWorkingDay(date, extraHolidays);
  for (let i = 0; i < n; i++) d = nextWorkingDay(d, extraHolidays);
  return d;
}

/**
 * The working day an order placed at `at` counts from. `at` is an instant, or a Prague date and
 * "HH:MM" wall-clock time. An order on a working day up to and including the `cutoff` minute
 * ("HH:MM", Prague time) starts that day; one after the cut-off, or on a non-working day, starts
 * the next working day.
 */
export function effectiveStartDate(
  at: Date | { date: string; time: string },
  cutoff: string,
  extraHolidays: readonly string[] = [],
): string {
  const date = at instanceof Date ? businessDay(at) : at.date;
  const minutes = at instanceof Date ? businessMinutes(at) : hhmmToMinutes(at.time);
  if (isWorkingDay(date, extraHolidays) && minutes <= hhmmToMinutes(cutoff)) return date;
  return nextWorkingDay(date, extraHolidays);
}

function hhmmToMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`Not a time of day (HH:MM): ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}
