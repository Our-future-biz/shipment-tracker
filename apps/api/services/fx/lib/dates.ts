// Calendar dates as yyyy-mm-dd strings, always in Prague time. ČNB fixings are Prague
// dates, and the UTC date is wrong between 00:00 and 02:00 local time. The day helpers and
// the Czech holiday calendar live in lib/businessDate.ts and lib/workingDays.ts.

import { addDays, businessDay, businessMinutes, isRealYmd } from "../../../lib/businessDate";
import { isWeekend, isWorkingDay, nextWorkingDay, previousWorkingDay } from "../../../lib/workingDays";

export { addDays, isRealYmd as isIsoDate };
export { isCzechHoliday, isWeekend, weekday } from "../../../lib/workingDays";

export function pragueToday(now = new Date()): string {
  return businessDay(now);
}

// Minutes since midnight in Prague.
export function pragueMinutes(now = new Date()): number {
  return businessMinutes(now);
}

export function previousWeekday(date: string): string {
  let d = addDays(date, -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

// A day ČNB publishes a fixing on: a Czech working day (a weekday that is not a public holiday).
export function isFixingDay(date: string): boolean {
  return isWorkingDay(date);
}

export function nextFixingDay(date: string): string {
  return nextWorkingDay(date);
}

export function previousFixingDay(date: string): string {
  return previousWorkingDay(date);
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

// ČNB publishes at about 14:30; the tool pulls at 15:00 Prague time and retries at 15:30
// and 16:00 (owner decision, 14 Oct 2026). A fixing still missing after the last pull is
// reported to the admins.
export const PULL_SLOTS = [15 * 60, 15 * 60 + 30, 16 * 60];
export const PUBLISH_MINUTES = PULL_SLOTS[0]!;
export const LAST_PULL_MINUTES = PULL_SLOTS.at(-1)!;

/**
 * The newest fixing that should be stored at `now`: today on a fixing day from the first
 * pull (15:00) on, otherwise the previous fixing day.
 */
export function expectedLatestFixing(now = new Date()): string {
  const today = pragueToday(now);
  if (isFixingDay(today) && pragueMinutes(now) >= PUBLISH_MINUTES) return today;
  return previousFixingDay(today);
}
