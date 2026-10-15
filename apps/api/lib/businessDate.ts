// The company works on Prague time. Whatever zone the server runs in, a "day" - the date in a
// quote reference, a validity date, "today" when a quote expires - is the calendar day there.
export const BUSINESS_TZ = "Europe/Prague";

const dayParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day in Prague at the given instant, as YYYY-MM-DD. */
export function businessDay(at: Date): string {
  const parts = Object.fromEntries(dayParts.formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** The day `n` days after a YYYY-MM-DD day (before it when `n` is negative). */
export function addDays(ymd: string, n: number): string {
  // Calendar days are counted in UTC, where no day is 23 or 25 hours long.
  const day = new Date(`${ymd}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + n);
  return day.toISOString().slice(0, 10);
}

/** Whether a text is a calendar day that exists, written as YYYY-MM-DD (2026-02-31 is not one). */
export function isRealYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const day = new Date(`${s}T00:00:00Z`);
  // An impossible day is either refused or rolled over into the next month; neither reads back.
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === s;
}

const timeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Minutes since midnight in Prague at the given instant (14:30 is 870). */
export function businessMinutes(at: Date): number {
  const parts = Object.fromEntries(timeParts.formatToParts(at).map((part) => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}
