// A Co-Loading Concept sailing's earnings (Council Outlay 13): what its shipments sell for and
// what they cost of their own, from each shipment's Costs Breakdown. Pure: the service reads the
// box's shipments (Shipments) and their money (Invoicing), this puts the two together.
//
// Every figure is a shipment's own, in CZK at its own ČNB rates, and in EUR at its own EUR rate, so
// a row agrees with the shipment's Costs Breakdown. A cancelled shipment is listed and not counted;
// its selling is shown apart. An amount with no rate is left out and named: a total with gaps says
// "incomplete". Money that could not be read is not known - never shown as 0.

import type { BoxUtilizationRow, EarningsAmount, EarningsRow, SailingBoxCosts, SailingEarnings, SailingProfit } from "../interfaces/interfaces";
import { boxCostsOf, shareCents } from "./coLoadingBoxCosts";

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
  handRoadLines?: number;
  missingCurrencies: string[];
  eurRate: number | null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** An amount in CZK and, at this rate, in EUR; no EUR figure without a rate. */
const amount = (czk: number, eurRate: number | null): EarningsAmount => ({ czk: round2(czk), eur: eurRate ? round2(czk / eurRate) : null });

/**
 * An amount as one figure: the one shown as the main one - EUR, or CZK where no EUR rate is known.
 * It decides profit or loss, the colour, the order of the rows (Council Review 7, K6): shipments are
 * valued at their own rates and the box at the departure day's, so EUR and CZK can disagree.
 */
export const lead = (a: EarningsAmount): number => a.eur ?? a.czk;

/** Two amounts in one currency to compare: both in EUR when both have one, else both in CZK. */
const inOne = (a: EarningsAmount, b: EarningsAmount): [number, number] => (a.eur !== null && b.eur !== null ? [a.eur, b.eur] : [a.czk, b.czk]);

/** Profit as a share of the revenue, in %, one decimal, in the figures shown; null without revenue. */
function marginOf(profit: EarningsAmount, selling: EarningsAmount): number | null {
  const [p, s] = inOne(profit, selling);
  return s > 0 ? Math.round((p / s) * 1000) / 10 : null;
}

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
 * a master job shares costs into. `box` are the costs of the sailing's boxes: once one is set, they
 * are shared over the counted shipments by W/M, to the cent - the loaded shipments carry the whole
 * box - and each shipment's profit and the sailing's follow. A shipment with no W/M carries none.
 * `fullPct` is how full the box is (its fuller meter, lib/boxUtilization): what is not sold of it
 * is the unsold space, and its share of the box costs is shown.
 */
export function sailingEarnings(
  shipments: readonly BoxUtilizationRow[],
  money: ReadonlyMap<string, ShipmentMoney> | null,
  inMasterJob: ReadonlySet<string>,
  box: SailingBoxCosts = boxCostsOf(1, [], null),
  fullPct: number | null = null,
): SailingEarnings {
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
      boxShare: null,
      profit: null,
      noShare: box.set && s.counted && !(s.freightTons > 0),
      // One figure missing: the W/M comes from the other alone, and may be too low (K4).
      cargoGap: s.counted && s.weightMissing !== s.volumeMissing ? (s.weightMissing ? "weight" : "volume") : null,
      cargoImplausible: s.counted && s.implausible,
      odd: s.odd,
      handRoadLines: m?.handRoadLines ?? 0,
      noSelling: m !== null && m.sellingLines === 0,
      untickedLines: m?.untickedLines ?? 0,
      unrecognisedLines: m?.unrecognisedLines ?? 0,
      missingCurrencies: m?.missingCurrencies ?? [],
      inMasterJob: inMasterJob.has(s.shipmentId) || (m?.masterJobCzk ?? 0) !== 0,
    };
  });

  const counted = rows.filter((r) => r.counted);
  const sum = (pick: (r: EarningsRow) => EarningsAmount) => total(counted.map(pick));

  // The box costs, shared by W/M: the CZK to the haléř and the EUR to the cent, each adding up to its total.
  const weights = counted.map((r) => r.freightTons);
  const czkParts = box.set ? shareCents(Math.round(box.total.czk * 100), weights) : null;
  const eurParts = box.set && box.total.eur !== null ? shareCents(Math.round(box.total.eur * 100), weights) : null;
  if (czkParts) {
    counted.forEach((r, i) => {
      if (!(r.freightTons > 0)) return;
      r.boxShare = { czk: czkParts[i]! / 100, eur: eurParts ? eurParts[i]! / 100 : null };
      r.profit = {
        czk: round2(r.beforeBox.czk - r.boxShare.czk),
        eur: r.beforeBox.eur !== null && r.boxShare.eur !== null ? round2(r.beforeBox.eur - r.boxShare.eur) : null,
      };
    });
  }
  // The rows that earn least stand first: the ones to look at.
  const earns = (r: EarningsRow) => lead(r.profit ?? r.beforeBox);
  rows.sort((a, b) => Number(b.counted) - Number(a.counted) || earns(a) - earns(b) || a.jobNumber.localeCompare(b.jobNumber));
  const beforeBox = sum((r) => r.beforeBox);
  const selling = sum((r) => r.selling);
  const profit: EarningsAmount | null = box.set
    ? { czk: round2(beforeBox.czk - box.total.czk), eur: beforeBox.eur !== null && box.total.eur !== null ? round2(beforeBox.eur - box.total.eur) : null }
    : null;

  const missingCurrencies = [...new Set(counted.flatMap((r) => r.missingCurrencies))].sort();
  const loadedWm = round2(counted.reduce((t, r) => t + r.freightTons, 0) * 10) / 10;
  // Break-even: at what the loaded shipments earn per W/M before the box, the W/M that covers it.
  // In the figures shown as the main ones (EUR where both are known), so "reached" agrees with the profit's sign.
  const [earned, boxCost] = inOne(beforeBox, box.total);
  const covers = earned > 0 && loadedWm > 0;
  // Not while a loaded shipment is not priced (K11): its W/M would count with no earning, and the
  // break-even would read far too high until the last selling line is in.
  const breakEvenWaitsFor = box.set ? counted.filter((r) => r.noSelling || !r.moneyKnown).length : 0;
  const ofLoaded = covers ? boxCost / earned : null;
  const breakEven: SailingEarnings["breakEven"] =
    box.set && loadedWm > 0 && breakEvenWaitsFor === 0
      ? {
          wm: covers ? Math.round((boxCost / (earned / loadedWm)) * 10) / 10 : null,
          loadedWm,
          ofLoaded: ofLoaded === null ? null : Math.round(ofLoaded * 1000) / 1000,
          reached: earned >= boxCost,
          // With the same mix of cargo: today's fill, scaled to the break-even load.
          boxPct: ofLoaded === null || fullPct === null ? null : Math.round(ofLoaded * fullPct),
        }
      : null;
  const unsoldPct = fullPct === null ? null : Math.max(0, 100 - fullPct);
  const unsold: SailingEarnings["unsold"] =
    box.set && unsoldPct !== null
      ? { pct: unsoldPct, cost: { czk: round2((box.total.czk * unsoldPct) / 100), eur: box.total.eur === null ? null : round2((box.total.eur * unsoldPct) / 100) } }
      : null;
  return {
    moneyKnown: money !== null,
    complete: money !== null && missingCurrencies.length === 0 && counted.every((r) => r.moneyKnown) && box.missingCurrencies.length === 0,
    totals: {
      shipments: counted.length,
      freightTons: loadedWm,
      selling,
      invoiced: sum((r) => r.invoiced),
      inland: sum((r) => r.inland),
      other: sum((r) => r.other),
      beforeBox,
      ownBox: sum((r) => r.ownBox),
      masterJob: sum((r) => r.masterJob),
      boxCosts: box.set ? box.total : null,
      profit,
      marginPct: profit ? marginOf(profit, selling) : null,
    },
    boxCosts: box,
    boxUnshared: box.set && czkParts === null,
    breakEven,
    breakEvenWaitsFor,
    unsold,
    notes: {
      noSelling: counted.filter((r) => r.noSelling).length,
      unticked: counted.filter((r) => r.untickedLines > 0).length,
      ownBox: counted.filter((r) => r.ownBox.czk !== 0).length,
      inMasterJob: counted.filter((r) => r.inMasterJob).length,
      unrecognised: counted.filter((r) => r.unrecognisedLines > 0).length,
      noShare: counted.filter((r) => r.noShare).length,
      cargoGap: counted.filter((r) => r.cargoGap !== null).length,
      cargoImplausible: counted.filter((r) => r.cargoImplausible).length,
      odd: counted.filter((r) => r.odd !== null).length,
      handRoad: counted.filter((r) => r.handRoadLines > 0).length,
      missingCurrencies,
    },
    notCounted: rows.length - counted.length,
    notCountedSelling: total(rows.filter((r) => !r.counted).map((r) => r.selling)),
    notCountedCosts: total(rows.filter((r) => !r.counted).flatMap((r) => [r.inland, r.other])),
    rows,
  };
}

/** Whether the profit may still move: a box cost in another currency is valued at a rate not fixed yet. */
export const profitProvisional = (e: SailingEarnings): boolean =>
  e.boxCosts.set && e.boxCosts.rateProvisional && e.boxCosts.containers.some((c) => c.lines.some((l) => l.amount !== null && l.currency !== "CZK"));

/** A sailing's profit at a glance, for the list of sailings: the figure, and everything that makes it less than final. */
export const sailingProfit = (sailingId: string, e: SailingEarnings): SailingProfit => ({
  sailingId,
  moneyKnown: e.moneyKnown,
  boxCostsSet: e.boxCosts.set,
  profit: e.moneyKnown ? e.totals.profit : null,
  marginPct: e.moneyKnown ? e.totals.marginPct : null,
  complete: e.complete,
  boxCostsComplete: e.boxCosts.notSet.length === 0 && e.boxCosts.ignoredContainers.length === 0,
  revenueComplete: e.notes.noSelling === 0,
  provisional: profitProvisional(e),
});
