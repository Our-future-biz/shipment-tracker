import { addDays, businessDayOf } from "@/lib/date";
import { czechHolidays, holidayKey } from "@/app/calendar/_lib/calendar";

// "POD missing": delivered more than 2 working days ago and the POD is not in. Working days are
// Monday to Friday except Czech public holidays, on the company's calendar (Prague) — the server
// counts the Consignments chip the same way. Tested in podMissing.test.ts.

export const POD_MISSING_WORKING_DAYS = 2;

/** Whether a day (YYYY-MM-DD) is a Czech working day. */
export function isWorkingDay(day: string): boolean {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const y = date.getUTCFullYear();
  return !czechHolidays(y).has(holidayKey(y, date.getUTCMonth(), date.getUTCDate()));
}

/** Working days after `from` up to and including `to` (0 when `to` is not later). */
export function workingDaysBetween(from: string, to: string): number {
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkingDay(d)) n += 1;
  return n;
}

/** How long a delivered consignment has waited for its POD, or null when it has it (or is not delivered). */
export function podWait(deliveredAt: string | null | undefined, podReceivedAt: string | null | undefined, today: string): { days: number; missing: boolean; text: string } | null {
  if (!deliveredAt || podReceivedAt) return null;
  const days = workingDaysBetween(businessDayOf(deliveredAt), today);
  const missing = days > POD_MISSING_WORKING_DAYS;
  const ago = days === 0 ? "today" : `${days} working day${days === 1 ? "" : "s"} ago`;
  return { days, missing, text: `Delivered ${ago}${missing ? " — POD missing" : ", waiting for the POD"}` };
}
