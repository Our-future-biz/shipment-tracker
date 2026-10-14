import { APIError } from "encore.dev/api";
import { invoicing, shipments } from "~encore/clients";
import { cnbRateRepository } from "../repositories/cnbRate.repository";
import { jobRateRepository } from "../repositories/jobRate.repository";
import type { LockedRates } from "../schemas/jobRate.schema";
import { pragueToday } from "../lib/dates";
import { resolveFixing } from "../lib/rates";
import { directionOf, planJobRates } from "../lib/jobRates";
import type { JobRates } from "../interfaces/interfaces";

/**
 * Whether the job has an issued (not credited) invoice, which makes its ATA/ATD — and so
 * its rate lock — final.
 */
async function jobIsInvoiced(companyId: string, shipmentId: string): Promise<boolean> {
  const { count } = await invoicing.openInvoiceCount({ shipmentId, companyId });
  return count > 0;
}

// Every ČNB currency's rate for `date`, with whether all of them are final for it.
async function ratesOn(date: string, today: string): Promise<{ rates: LockedRates; final: boolean }> {
  const currencies = await cnbRateRepository.currencies();
  const rows = await cnbRateRepository.latestOnOrBefore(date, currencies);
  const rates: LockedRates = {};
  let final = rows.length > 0;
  for (const row of rows) {
    const res = resolveFixing([row], date, today);
    if (!res) continue;
    rates[row.currency] = { rate: res.rate, fixingDate: res.fixingDate };
    if (res.provisional) final = false;
  }
  return { rates, final };
}

function toList(rates: LockedRates): JobRates["rates"] {
  return Object.entries(rates)
    .map(([currency, r]) => ({ currency, rate: r.rate, fixingDate: r.fixingDate }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export const fxJobRatesService = {
  async forShipment(companyId: string, shipmentId: string): Promise<JobRates> {
    let shipment;
    try {
      ({ shipment } = await shipments.shipmentGet({ shipmentId }));
    } catch {
      throw APIError.notFound("Shipment not found");
    }
    const today = pragueToday();
    const { direction, assumed } = directionOf(shipment.tradeDirection ?? "");
    const lock = await jobRateRepository.get(companyId, shipmentId);
    const invoiced = lock ? await jobIsInvoiced(companyId, shipmentId) : false;

    // Whether ČNB's fixing for a date is published and final (checked only when needed).
    let checked: { date: string; result: Awaited<ReturnType<typeof ratesOn>> } | null = null;
    const finalOn = async (date: string) => {
      if (checked?.date !== date) checked = { date, result: await ratesOn(date, today) };
      return checked.result;
    };
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

    const base = { shipmentId, direction, directionAssumed: assumed };
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
    const { rates } = await finalOn(plan.date);
    return {
      ...base,
      status: "provisional",
      basis: plan.basis,
      rateDate: plan.date,
      lockedAt: null,
      previousRateDate: null,
      rates: toList(rates),
    };
  },
};
