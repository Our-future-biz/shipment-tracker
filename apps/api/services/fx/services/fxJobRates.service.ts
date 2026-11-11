import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";
import { invoicing, shipments } from "~encore/clients";
import { cnbRateRepository } from "../repositories/cnbRate.repository";
import { jobRateRepository } from "../repositories/jobRate.repository";
import type { JobRateRecord, LockedRates } from "../schemas/jobRate.schema";
import { expectedLatestFixing, pragueToday } from "../lib/dates";
import { ratesForDate } from "../lib/rates";
import { directionOf, planJobRates, type JobDates } from "../lib/jobRates";
import type { JobRates } from "../interfaces/interfaces";

/**
 * Whether the job has an issued (not credited) invoice, which makes its ATA/ATD — and so
 * its rate lock — final. The company comes from the caller's auth on the service call.
 */
async function jobIsInvoiced(shipmentId: string): Promise<boolean> {
  const { count } = await invoicing.openInvoiceCount({ shipmentId });
  return count > 0;
}

interface DateRates {
  rates: LockedRates;
  final: boolean; // every rate is ČNB's final one for the date
  missing: boolean; // a fixing that should be stored isn't (import failed) — never lock on it
}

// Every ČNB currency's rate for `date`, with whether they can be locked. A currency ČNB no
// longer publishes (BGN after 2025-12-31) has no rate and never holds the lock back.
async function ratesOn(date: string): Promise<DateRates> {
  const currencies = await cnbRateRepository.currencies();
  const rows = await cnbRateRepository.latestOnOrBefore(date, currencies);
  const day = ratesForDate(rows, date, expectedLatestFixing());
  const rates: LockedRates = Object.fromEntries(day.rates.map((r) => [r.currency, { rate: r.rate, fixingDate: r.fixingDate }]));
  return { rates, final: day.rates.length > 0 && !day.provisional && !day.missing, missing: day.missing };
}

// ČNB's rates for a date, read once per date for one call however many jobs it values.
function ratesByDate(): (date: string) => Promise<DateRates> {
  const read = new Map<string, Promise<DateRates>>();
  return (date) => {
    let rates = read.get(date);
    if (!rates) {
      rates = ratesOn(date);
      read.set(date, rates);
    }
    return rates;
  };
}

function toList(rates: LockedRates): JobRates["rates"] {
  return Object.entries(rates)
    .map(([currency, r]) => ({ currency, rate: r.rate, fixingDate: r.fixingDate }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** What a job's rates are worked out from: its shipment's dates, its lock, and whether it is invoiced. */
interface JobFacts {
  shipmentId: string;
  shipment: JobDates;
  lock: JobRateRecord | null;
  invoiced: boolean;
}

// The rates a job is valued at, from what was read of it; locks the job when its ATA/ATD calls for it.
async function jobRatesOf(companyId: string, job: JobFacts, finalOn: (date: string) => Promise<DateRates>, today: string): Promise<JobRates> {
  const { shipmentId, shipment, lock, invoiced } = job;
  const { direction, assumed } = directionOf(shipment.tradeDirection ?? "");
  const actual = direction === "export" ? shipment.actualDeparture : shipment.actualArrival;
  const actualFinal = actual && actual <= today ? (await finalOn(actual)).final : false;

  const plan = planJobRates(
    {
      tradeDirection: shipment.tradeDirection ?? "",
      estimatedArrival: shipment.estimatedArrival,
      estimatedDeparture: shipment.estimatedDeparture,
      actualArrival: shipment.actualArrival,
      actualDeparture: shipment.actualDeparture,
    },
    today,
    lock,
    invoiced,
    () => actualFinal,
  );

  const base = { shipmentId, direction, directionAssumed: assumed, ratesMissing: false };
  if (plan.action === "use_lock") {
    if (!lock) throw APIError.internal("Job rate lock missing"); // planJobRates only keeps an existing lock
    return {
      ...base,
      status: "locked",
      basis: plan.basis,
      rateDate: lock.rateDate,
      lockedAt: lock.lockedAt.toISOString(),
      previousRateDate: lock.previousRateDate,
      rates: toList(lock.rates),
    };
  }
  if (plan.action === "lock") {
    const { rates } = await finalOn(plan.date);
    const row = await jobRateRepository.lock(companyId, shipmentId, plan.basis, plan.date, rates);
    return {
      ...base,
      status: "locked",
      basis: plan.basis,
      rateDate: row.rateDate,
      lockedAt: row.lockedAt.toISOString(),
      previousRateDate: row.previousRateDate,
      rates: toList(row.rates),
    };
  }
  const { rates, missing } = await finalOn(plan.date);
  return {
    ...base,
    ratesMissing: missing,
    status: "provisional",
    basis: plan.basis,
    rateDate: plan.date,
    lockedAt: null,
    previousRateDate: null,
    rates: toList(rates),
  };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The shipments read for a batch at the same time at most, so a customer's 200 jobs are no burst on Shipments. */
const SHIPMENT_READS_AT_ONCE = 10;

async function inTurns<T, R>(items: T[], atOnce: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += atOnce) out.push(...(await Promise.all(items.slice(i, i + atOnce).map(work))));
  return out;
}

export const fxJobRatesService = {
  async forShipment(companyId: string, shipmentId: string): Promise<JobRates> {
    let shipment;
    try {
      ({ shipment } = await shipments.shipmentGet({ shipmentId }));
    } catch (err) {
      if (err instanceof APIError && err.code === ErrCode.NotFound) throw APIError.notFound("Shipment not found");
      throw err;
    }
    const lock = await jobRateRepository.get(companyId, shipmentId);
    const invoiced = lock ? await jobIsInvoiced(shipmentId) : false;
    return jobRatesOf(companyId, { shipmentId, shipment, lock, invoiced }, ratesByDate(), pragueToday());
  },

  /**
   * The rates of several jobs at once (a customer's Shipments tab), each worked out as forShipment
   * does - and locked as it would be. Read together: the locks in one query, which jobs are invoiced
   * in one call to Invoicing, ČNB's rates once per date; only the shipments are read one by one (a
   * few at a time), as Shipments reads no batch of them. A job that can't be read (gone, another
   * company's, a service not answering) is listed as unreadable rather than failing the others.
   */
  async forShipments(companyId: string, shipmentIds: string[]): Promise<{ jobs: JobRates[]; unreadable: string[] }> {
    const ids = [...new Set(shipmentIds)];
    if (!ids.length) return { jobs: [], unreadable: [] };
    const unreadable = new Set<string>();
    const read = await inTurns(ids, SHIPMENT_READS_AT_ONCE, async (shipmentId) => {
      try {
        const { shipment } = await shipments.shipmentGet({ shipmentId });
        return { shipmentId, shipment };
      } catch (err) {
        log.warn("job rates: shipment not readable", { shipmentId, error: errorText(err) });
        unreadable.add(shipmentId);
        return null;
      }
    });
    const found = read.filter((r): r is NonNullable<typeof r> => r !== null);
    const locks = await jobRateRepository.getMany(companyId, found.map((r) => r.shipmentId));
    let invoiced = new Set<string>();
    const locked = [...locks.keys()];
    if (locked.length) {
      try {
        invoiced = new Set((await invoicing._internalOpenInvoiceShipments({ shipmentIds: locked })).shipmentIds);
      } catch (err) {
        // Without it a lock might move that an invoice holds: those jobs are not valued this time.
        log.warn("job rates: invoiced jobs not readable", { count: locked.length, error: errorText(err) });
        for (const id of locked) unreadable.add(id);
      }
    }
    const finalOn = ratesByDate();
    const today = pragueToday();
    const jobs: JobRates[] = [];
    for (const { shipmentId, shipment } of found) {
      if (unreadable.has(shipmentId)) continue;
      try {
        jobs.push(await jobRatesOf(companyId, { shipmentId, shipment, lock: locks.get(shipmentId) ?? null, invoiced: invoiced.has(shipmentId) }, finalOn, today));
      } catch (err) {
        log.warn("job rates: not worked out", { shipmentId, error: errorText(err) });
        unreadable.add(shipmentId);
      }
    }
    return { jobs, unreadable: ids.filter((id) => unreadable.has(id)) };
  },
};
