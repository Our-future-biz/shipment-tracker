// A Co-Loading Concept sailing's earnings (Council Outlay 13): what its shipments sell for and
// what they cost of their own, from each shipment's Costs Breakdown. Pure: the service reads the
// box's shipments (Shipments) and their money (Invoicing), this puts the two together.
//
// Every figure is a shipment's own, in CZK at its own ČNB rates, and in EUR at its own EUR rate, so
// a row agrees with the shipment's Costs Breakdown. A cancelled shipment is listed and not counted;
// its selling is shown apart. An amount with no rate is left out and named: a total with gaps says
// "incomplete". Money that could not be read is not known - never shown as 0.

import type { BoxUtilizationRow, EarningsAmount, EarningsRow, SailingEarnings } from "../interfaces/interfaces";

/** A shipment's money as Invoicing gives it (its `_internalCoLoadingMoney`). */
export interface ShipmentMoney {
  shipmentId: string;
  sellingCzk: number;
  invoicedCzk: number;
  inlandCzk: number;
  otherCzk: number;
  ownBoxCzk: number;
  masterJobCzk: number;
  sellingLines: number;
  untickedLines: number;
  unrecognisedLines: number;
  missingCurrencies: string[];
  eurRate: number | null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** An amount in CZK and, at this rate, in EUR; no EUR figure without a rate. */
const amount = (czk: number, eurRate: number | null): EarningsAmount => ({ czk: round2(czk), eur: eurRate ? round2(czk / eurRate) : null });

/** Amounts added up; the EUR total is not known as soon as one of them has no EUR figure. */
function total(amounts: readonly EarningsAmount[]): EarningsAmount {
  return {
    czk: round2(amounts.reduce((sum, a) => sum + a.czk, 0)),
    eur: amounts.some((a) => a.eur === null && a.czk !== 0) ? null : round2(amounts.reduce((sum, a) => sum + (a.eur ?? 0), 0)),
  };
}

/**
 * The earnings of a sailing. `shipments` are the box's rows (lib/boxUtilization), `money` each
 * shipment's money by id - null when Invoicing could not be read - and `inMasterJob` the shipments
 * a master job shares costs into.
 */
export function sailingEarnings(shipments: readonly BoxUtilizationRow[], money: ReadonlyMap<string, ShipmentMoney> | null, inMasterJob: ReadonlySet<string>): SailingEarnings {
  const rows: EarningsRow[] = shipments.map((s) => {
    const m = money?.get(s.shipmentId) ?? null;
    const of = (czk: number) => amount(czk, m?.eurRate ?? null);
    return {
      shipmentId: s.shipmentId,
      jobNumber: s.jobNumber,
      customer: s.customer,
      status: s.status,
      counted: s.counted,
      freightTons: s.freightTons,
      moneyKnown: m !== null,
      selling: of(m?.sellingCzk ?? 0),
      invoiced: of(m?.invoicedCzk ?? 0),
      inland: of(m?.inlandCzk ?? 0),
      other: of(m?.otherCzk ?? 0),
      beforeBox: of((m?.sellingCzk ?? 0) - (m?.inlandCzk ?? 0) - (m?.otherCzk ?? 0)),
      ownBox: of(m?.ownBoxCzk ?? 0),
      masterJob: of(m?.masterJobCzk ?? 0),
      noSelling: m !== null && m.sellingLines === 0,
      untickedLines: m?.untickedLines ?? 0,
      unrecognisedLines: m?.unrecognisedLines ?? 0,
      missingCurrencies: m?.missingCurrencies ?? [],
      inMasterJob: inMasterJob.has(s.shipmentId) || (m?.masterJobCzk ?? 0) !== 0,
    };
  });

  const counted = rows.filter((r) => r.counted);
  const sum = (pick: (r: EarningsRow) => EarningsAmount) => total(counted.map(pick));
  // The rows that earn least stand first: the ones to look at.
  rows.sort((a, b) => Number(b.counted) - Number(a.counted) || a.beforeBox.czk - b.beforeBox.czk || a.jobNumber.localeCompare(b.jobNumber));

  const missingCurrencies = [...new Set(counted.flatMap((r) => r.missingCurrencies))].sort();
  return {
    moneyKnown: money !== null,
    complete: money !== null && missingCurrencies.length === 0 && counted.every((r) => r.moneyKnown),
    totals: {
      shipments: counted.length,
      freightTons: round2(counted.reduce((t, r) => t + r.freightTons, 0) * 10) / 10,
      selling: sum((r) => r.selling),
      invoiced: sum((r) => r.invoiced),
      inland: sum((r) => r.inland),
      other: sum((r) => r.other),
      beforeBox: sum((r) => r.beforeBox),
      ownBox: sum((r) => r.ownBox),
      masterJob: sum((r) => r.masterJob),
    },
    notes: {
      noSelling: counted.filter((r) => r.noSelling).length,
      unticked: counted.filter((r) => r.untickedLines > 0).length,
      ownBox: counted.filter((r) => r.ownBox.czk !== 0).length,
      inMasterJob: counted.filter((r) => r.inMasterJob).length,
      unrecognised: counted.filter((r) => r.unrecognisedLines > 0).length,
      missingCurrencies,
    },
    notCounted: rows.length - counted.length,
    notCountedSelling: total(rows.filter((r) => !r.counted).map((r) => r.selling)),
    rows,
  };
}
