// Office hours: 08:00-17:00 in Prague on Czech working days. One clock for every wait the app
// ages in office time (a rep's discount question in Sales, a document waiting for customs and a
// remeasurement on Shipments → Managers), so "4 office hours" means the same on every page. Pure:
// no database, no Encore.
import { addDays, businessDay, businessMinutes } from "./businessDate";
import { isWorkingDay } from "./workingDays";

/** Minutes since midnight (Prague) the office opens and closes. */
export const OFFICE_START_MINUTES = 8 * 60;
export const OFFICE_END_MINUTES = 17 * 60;

/**
 * Office minutes (08:00-17:00 Prague, working days) between two moments; 0 when `to` is not later.
 * `extraHolidays`: further non-working days (YYYY-MM-DD) on top of the weekends and the statutory
 * holidays - the days a company uploaded - so office hours and working days agree where both count.
 */
export function officeMinutesBetween(from: Date, to: Date, extraHolidays: readonly string[] = []): number {
  if (to.getTime() <= from.getTime()) return 0;
  const first = businessDay(from);
  const last = businessDay(to);
  let total = 0;
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (!isWorkingDay(day, extraHolidays)) continue;
    const start = Math.max(OFFICE_START_MINUTES, day === first ? businessMinutes(from) : 0);
    const end = Math.min(OFFICE_END_MINUTES, day === last ? businessMinutes(to) : 24 * 60);
    if (end > start) total += end - start;
  }
  return total;
}
