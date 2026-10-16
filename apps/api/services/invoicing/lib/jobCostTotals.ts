// A job's revenue, cost and profit as its Costs Breakdown works them out, on the server: the
// customer's Shipments tab reads these instead of loading every job's costs into the browser.
// Rules (the same as Costs Breakdown, apps/web/.../tabs/costsCalc.ts):
//  - a row = quantity × unit price (blank quantity = 1; a 0 typed on purpose stays 0, as on invoices)
//  - buying counts the real cost once it is filled in, otherwise the estimate
//  - selling counts only rows ticked "Invoice" — that is what gets billed
//  - everything goes through CZK with the job's ČNB rates (fx job rates)
//  - an amount in a currency without a rate is NEVER taken at 1: the job's totals are then null
//    (a total that leaves something out is not shown), and the currency is reported.
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
    const real = toNumber(r.realAmount) * qtyOrOne(r.realQty);
    const est = toNumber(r.estAmount) * qtyOrOne(r.estQty);
    const v = real ? czk(real, r.realCurrency || "CZK") : czk(est, r.estCurrency || "CZK");
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
