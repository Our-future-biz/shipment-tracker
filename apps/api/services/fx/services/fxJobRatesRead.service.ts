import log from "encore.dev/log";
import { isUuid } from "../../../lib/uuid";
import { cnbRateRepository } from "../repositories/cnbRate.repository";
import { jobRateRepository } from "../repositories/jobRate.repository";
import type { JobRateRecord, LockedRates } from "../schemas/jobRate.schema";
import { addDays, expectedLatestFixing, pragueToday } from "../lib/dates";
import { directionOf, type JobDates } from "../lib/jobRates";
import { jobDatesOf, latestFixingsOn, planJobRatesRead, type JobRatesReadPlan } from "../lib/jobRatesRead";
import { ratesForDate, type Fixing } from "../lib/rates";
import type { JobRates } from "../interfaces/interfaces";
import type { JobRatesReadJob, JobRatesReadResponse } from "../interfaces/jobRatesRead";

// The rates of many jobs, READ ONLY (Shipments → Managers, the Money tab). services/fxJobRates
// values a job the same way and fixes its rates as it reads; nothing here writes: a job whose
// ATA/ATD calls for fixing is answered the rates of that date - the ones the Costs tab would fix and
// show - and stays not fixed. The job's dates come from the caller (Shipments reads no batch of
// them to another service), so the whole answer is two statements: the fixed rates of the jobs, and
// ČNB's fixings over the dates asked for. A job answered its stored rates needs no date's rates, so
// its date is not read at all.

/** How far back ČNB's fixings are read in one statement; a date older than that is read on its own. */
const WINDOW_DAYS = 800;
/** A fixing is carried over weekends and public holidays: the fixings this many days before a date hold its rate. */
const CARRY_DAYS = 31;
/** Dates older than the window read one by one, at most; the jobs of any more are not valued. */
const OLD_DATES_AT_MOST = 20;
/**
 * A currency ČNB publishes on every fixing day. Read beside the currencies asked for, so the newest fixing of
 * all is known: by it a currency ČNB stopped publishing (BGN) is told from one that is only carried over.
 */
const ALWAYS_PUBLISHED = "EUR";

interface DateRates {
  rates: LockedRates;
  missing: boolean; // a fixing that should be stored isn't (import failed)
}

/** A date's rates from the newest fixing of each currency on or before it, as fxJobRates reads them. */
function dateRates(latest: Fixing[], date: string, expected: string): DateRates {
  const day = ratesForDate(latest, date, expected);
  const rates: LockedRates = Object.fromEntries(day.rates.map((r) => [r.currency, { rate: r.rate, fixingDate: r.fixingDate }]));
  return { rates, missing: day.missing };
}

/**
 * ČNB's rates for each date: one read for the dates of the last two years, a read each for the few older ones.
 * With `currencies`, only theirs are read (and the one that tells a currency no longer published).
 */
async function ratesOnDates(dates: string[], today: string, currencies: ReadonlySet<string> | null): Promise<Map<string, DateRates>> {
  const out = new Map<string, DateRates>();
  if (!dates.length) return out;
  const expected = expectedLatestFixing();
  const floor = addDays(today, -WINDOW_DAYS);
  const recent = dates.filter((d) => d >= floor).sort();
  const old = dates.filter((d) => d < floor).sort().reverse();
  const only = currencies ? [...new Set([...currencies, ALWAYS_PUBLISHED])].sort() : null;
  if (recent.length) {
    // From before the earliest date - and before today, whose fixing a date still ahead is valued at.
    const from = addDays(recent[0]! < today ? recent[0]! : today, -CARRY_DAYS);
    const rows = await (only ? cnbRateRepository.between(from, recent.at(-1)!, only) : cnbRateRepository.between(from, recent.at(-1)!));
    for (const [date, latest] of latestFixingsOn(rows, recent)) out.set(date, dateRates(latest, date, expected));
  }
  if (old.length) {
    const read = only ?? (await cnbRateRepository.currencies());
    for (const date of old.slice(0, OLD_DATES_AT_MOST)) out.set(date, dateRates(await cnbRateRepository.latestOnOrBefore(date, read), date, expected));
    if (old.length > OLD_DATES_AT_MOST) log.warn("job rates read: dates too old to read at once", { count: old.length - OLD_DATES_AT_MOST });
  }
  return out;
}

function toList(rates: LockedRates, currencies: ReadonlySet<string> | null): JobRates["rates"] {
  return Object.entries(rates)
    .filter(([currency]) => !currencies || currencies.has(currency))
    .map(([currency, r]) => ({ currency, rate: r.rate, fixingDate: r.fixingDate }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

const fromLock = (shipmentId: string, lock: JobRateRecord, dates: JobDates | null, currencies: ReadonlySet<string> | null): JobRates => {
  // Without the job's dates the direction is the one its rates were fixed by (ATD: an export).
  const { direction, assumed } = dates ? directionOf(dates.tradeDirection) : { direction: lock.basis === "atd" ? ("export" as const) : ("import" as const), assumed: false };
  return {
    shipmentId,
    direction,
    directionAssumed: assumed,
    ratesMissing: false,
    status: "locked",
    basis: lock.basis,
    rateDate: lock.rateDate,
    lockedAt: lock.lockedAt.toISOString(),
    previousRateDate: lock.previousRateDate,
    rates: toList(lock.rates, currencies),
  };
};

export const fxJobRatesReadService = {
  /**
   * What each job would be shown at in Costs Breakdown, without fixing anything. `currencies`, when
   * given, are the only ones answered (a cockpit of two thousand jobs needs three of ČNB's thirty).
   */
  async forJobs(companyId: string, asked: JobRatesReadJob[], onlyCurrencies: string[] = []): Promise<JobRatesReadResponse> {
    const currencies = onlyCurrencies.length ? new Set(onlyCurrencies.map((c) => c.trim().toUpperCase())) : null;
    const unreadable = new Set<string>();
    const notFixed: string[] = [];
    const jobs = new Map<string, { dates: JobDates | null; invoiced: boolean | null }>();
    for (const job of asked) {
      if (jobs.has(job.shipmentId) || unreadable.has(job.shipmentId)) continue;
      const dates = job.dates ? jobDatesOf(job.dates) : null;
      if (!isUuid(job.shipmentId) || (job.dates && !dates)) unreadable.add(job.shipmentId);
      else jobs.set(job.shipmentId, { dates, invoiced: job.invoiced ?? null });
    }
    if (!jobs.size) return { jobs: [], notFixed, unreadable: [...unreadable] };

    const today = pragueToday();
    const locks = await jobRateRepository.getMany(companyId, [...jobs.keys()]);
    // Planned first: only a job shown at a date needs that date's rates - stored rates need none.
    const plans = new Map<string, JobRatesReadPlan>();
    for (const [shipmentId, { dates, invoiced }] of jobs) plans.set(shipmentId, planJobRatesRead(dates, today, locks.get(shipmentId) ?? null, invoiced));
    const dated = [...plans.values()].flatMap((plan) => (plan.show === "date" ? [plan.date] : []));
    const ratesOn = await ratesOnDates([...new Set(dated)], today, currencies);

    const out: JobRates[] = [];
    for (const [shipmentId, { dates }] of jobs) {
      const lock = locks.get(shipmentId) ?? null;
      const plan = plans.get(shipmentId)!;
      if (plan.show === "lock" && lock) {
        out.push(fromLock(shipmentId, lock, dates, currencies));
        continue;
      }
      if (plan.show === "nothing" && plan.why === "not_fixed") {
        notFixed.push(shipmentId);
        continue;
      }
      const day = plan.show === "date" ? ratesOn.get(plan.date) : undefined;
      if (plan.show !== "date" || !day || !dates) {
        unreadable.add(shipmentId);
        continue;
      }
      const { direction, assumed } = directionOf(dates.tradeDirection);
      out.push({
        shipmentId,
        direction,
        directionAssumed: assumed,
        ratesMissing: day.missing,
        status: "provisional",
        basis: plan.basis,
        rateDate: plan.date,
        lockedAt: null,
        previousRateDate: null,
        rates: toList(day.rates, currencies),
      });
    }
    return { jobs: out, notFixed, unreadable: [...unreadable] };
  },
};
