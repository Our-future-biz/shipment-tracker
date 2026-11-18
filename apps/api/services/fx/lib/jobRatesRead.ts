// A job's rates read without fixing them: the same plan as lib/jobRates, but what it would fix is
// only shown. Pure; the reads are in services/fxJobRatesRead.service.

import { isIsoDate } from "./dates";
import { planJobRates, type JobDates } from "./jobRates";
import type { Fixing } from "./rates";

/** A date as Shipments holds it: its day; null for none; undefined when it is no date. */
export function dayOf(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || value.trim() === "") return null;
  const day = value.trim().slice(0, 10);
  return isIsoDate(day) ? day : undefined;
}

/** The job's dates as days; null when one of them is no date (the job is then not valued, never valued by another date). */
export function jobDatesOf(dates: JobDates): JobDates | null {
  const days = [dates.estimatedArrival, dates.estimatedDeparture, dates.actualArrival, dates.actualDeparture].map(dayOf);
  if (days.some((d) => d === undefined)) return null;
  const [estimatedArrival, estimatedDeparture, actualArrival, actualDeparture] = days as (string | null)[];
  return { tradeDirection: dates.tradeDirection ?? "", estimatedArrival: estimatedArrival!, estimatedDeparture: estimatedDeparture!, actualArrival: actualArrival!, actualDeparture: actualDeparture! };
}

export type JobRatesReadPlan =
  /** The rates fixed for the job, as stored */
  | { show: "lock" }
  /** The rates of a date: none are fixed that hold, and reading fixes none */
  | { show: "date"; basis: "ata" | "atd" | "eta" | "etd" | "today"; date: string }
  | { show: "nothing"; why: "not_fixed" | "lock_may_move" };

/**
 * What a job is shown at, as planJobRates would have it valued - without the fixing. A plan to fix
 * (first time, or the ATA/ATD moved) shows that date's rates: the ones the Costs tab would fix and
 * show. So whether that date's fixing is final yet changes nothing here (it only decides whether the
 * fixing read would fix): the plan needs no rate, and only a job shown at a date needs that date's
 * rates read. Without the job's dates only rates already fixed are known. Fixed rates that would
 * move unless an invoice holds them are not shown while `invoiced` is not known (as the batch read
 * leaves such a job out).
 */
export function planJobRatesRead(dates: JobDates | null, today: string, lock: { rateDate: string } | null, invoiced: boolean | null): JobRatesReadPlan {
  if (!dates) return lock ? { show: "lock" } : { show: "nothing", why: "not_fixed" };
  // "Fix now" and "not final yet" name the same basis and date; stored rates that hold are told apart before either.
  const plan = planJobRates(dates, today, lock, invoiced === true, () => false);
  if (plan.action === "use_lock") return { show: "lock" };
  if (lock && invoiced === null) return { show: "nothing", why: "lock_may_move" };
  return { show: "date", basis: plan.basis, date: plan.date };
}

/**
 * For each date, the newest fixing of every currency on or before it - what the repository's
 * latestOnOrBefore answers for one date, worked out for many from one read. `rows` are fixings in
 * any order; a currency with no fixing that old is left out of that date.
 */
export function latestFixingsOn<T extends Fixing>(rows: readonly T[], dates: readonly string[]): Map<string, T[]> {
  const byDay = [...rows].sort((a, b) => a.validDate.localeCompare(b.validDate));
  const out = new Map<string, T[]>();
  const latest = new Map<string, T>();
  let next = 0;
  for (const date of [...new Set(dates)].sort()) {
    while (next < byDay.length && byDay[next]!.validDate <= date) {
      latest.set(byDay[next]!.currency, byDay[next]!);
      next += 1;
    }
    out.set(date, [...latest.values()]);
  }
  return out;
}
