// A job's revenue, cost and profit as its Costs Breakdown works them out, on the server: the
// customer's Shipments tab reads these instead of loading every job's costs into the browser.
// Rules (the same as Costs Breakdown, apps/web/.../tabs/costsCalc.ts):
//  - a row = quantity × unit price (blank quantity = 1; a 0 typed on purpose stays 0, as on invoices)
//  - buying counts the real cost once its amount is filled in, even when it comes to 0, and the
//    estimate only while the real amount is blank (countedCost)
//  - selling counts only rows ticked "Invoice" — that is what gets billed
//  - everything goes through CZK with the job's ČNB rates (fx job rates)
//  - an amount in a currency without a rate is NEVER taken at 1: the job's totals are then null
//    (a total that leaves something out is not shown), and the currency is reported. A cost of 0
//    needs no rate.
// Pure, so it is unit-tested.

import { qtyOrOne, toNumber } from "./invoiceCalc";
import type { ShipmentCostTotals } from "../interfaces/interfaces";

/** CZK per 1 unit of each currency; CZK itself is 1. */
export type CzkRates = Record<string, number>;

export interface CostBuyRow {
  estQty: string | null;
  estAmount: string | null;
  estCurrency: string;
  realQty: string | null;
  realAmount: string | null;
  realCurrency: string;
}

export interface CostSellRow {
  qty: string | null;
  amount: string | null;
  currency: string;
  invoice: boolean;
}

/** The totals without the job's id; see ShipmentCostTotals. */
export type JobCostTotals = Omit<ShipmentCostTotals, "shipmentId">;

/**
 * Whether an amount is filled in: not blank (null or empty text) - a 0 typed is filled in. A cost line's real cost
 * counts from then on, and its estimate is one to set a real cost against (Operations money's like for like).
 */
export const filledIn = (amount: string | null): boolean => amount !== null && amount.trim() !== "";

/** Whether a buying line's real cost counts: once its amount is filled in, even when the line comes to 0. */
export const realCounts = (r: Pick<CostBuyRow, "realAmount">): boolean => filledIn(r.realAmount);

/**
 * What a buying line counts at, in its own currency: its real cost once its amount is filled in, even when it comes
 * to 0 (an amount of 0, or a quantity of 0), and its estimate only while the real amount is blank. The one rule of
 * every buying figure: Costs Breakdown (web costsCalc), these totals, Operations money, a sailing's Earnings and the
 * Job Profit report.
 */
export function countedCost(r: CostBuyRow): { amount: number; currency: string } {
  return realCounts(r)
    ? { amount: toNumber(r.realAmount) * qtyOrOne(r.realQty), currency: r.realCurrency || "CZK" }
    : { amount: toNumber(r.estAmount) * qtyOrOne(r.estQty), currency: r.estCurrency || "CZK" };
}

function rateOf(currency: string, rates: CzkRates): number | null {
  if (!currency || currency === "CZK") return 1;
  const r = rates[currency];
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function jobCostTotals(
  buying: CostBuyRow[],
  selling: CostSellRow[],
  billingCurrency: string,
  rates: CzkRates,
  currency: string,
): JobCostTotals {
  const missing = new Set<string>();
  const czk = (value: number, cur: string): number | null => {
    const r = rateOf(cur, rates);
    if (r === null) {
      missing.add(cur);
      return null;
    }
    return value * r;
  };
  // Costs Breakdown values every row in the billing currency: without its rate nothing is known.
  if (rateOf(billingCurrency || "CZK", rates) === null) missing.add(billingCurrency);

  let cost = 0;
  for (const r of buying) {
    const { amount, currency: cur } = countedCost(r);
    // A cost of 0 needs no rate: a real cost of 0 in a currency without one leaves nothing out.
    if (!amount) continue;
    const v = czk(amount, cur);
    if (v !== null) cost += v;
  }
  let revenue = 0;
  for (const r of selling) {
    // An unticked row is checked for its rate too: Costs Breakdown leaves the whole job out then.
    const v = czk(toNumber(r.amount) * qtyOrOne(r.qty), r.currency || "CZK");
    if (v !== null && r.invoice) revenue += v;
  }

  const missingCurrencies = [...missing].sort();
  if (missingCurrencies.length) {
    return { revenueCzk: null, costCzk: null, profitCzk: null, revenue: null, cost: null, profit: null, missingCurrencies };
  }
  const shown = rateOf(currency || "CZK", rates);
  const inShown = (v: number) => (shown === null ? null : round2(v / shown));
  return {
    revenueCzk: round2(revenue),
    costCzk: round2(cost),
    profitCzk: round2(revenue - cost),
    revenue: inShown(revenue),
    cost: inShown(cost),
    profit: inShown(revenue - cost),
    missingCurrencies,
  };
}
