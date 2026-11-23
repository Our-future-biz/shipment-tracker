// A shipment's money as a Co-Loading sailing's Earnings tab reads it (Council Outlay 13): its
// selling, and its buying lines sorted into baskets. The box - origin costs, ocean freight,
// destination costs - is priced on the sailing by a manager, so a shipment's own lines of those
// kinds are not counted there; they are added up apart, to be listed. Pure, so it is unit-tested.
//
// Line rules are Costs Breakdown's (lib/jobCostTotals): a row = quantity × unit price (blank
// quantity = 1); buying counts the real cost once filled, otherwise the estimate; selling counts only
// rows ticked "Invoice". Unlike there, an amount in a currency with no rate is left out and its
// currency named (decision D11): the rest of the shipment, and of the sailing, is still shown.

import { chargeGroup, toChargeCode } from "../../../lib/chargeCodes";
import type { CoLoadingMoneyItem } from "../interfaces/interfaces";
import { qtyOrOne, toNumber } from "./invoiceCalc";
import type { CzkRates } from "./jobCostTotals";

/**
 * The charge codes that are inland delivery (decision D2): moving the cargo over land at
 * destination. LCL and air have one code for collection and delivery alike, so a pick-up at origin
 * typed under it counts too, until inland delivery has a code of its own. Road freight on a sea job
 * is the last mile, and every row Trucking writes is one, whatever its code.
 */
export const INLAND_DELIVERY_CODES: readonly string[] = [
  "inland_collection",
  "inland_haulage",
  "bb_on_carriage",
  "rail_on_carriage",
  "tail_lift",
  "timed_delivery",
  "redelivery",
  "remote_area",
  "delivery",
  "collection",
  "road_freight",
  "road_fuel",
  "road_toll",
];

/** Where a buying line goes: counted as inland delivery or as another cost, or left out because the box or a master job covers it. */
export type CostBasket = "inland" | "other" | "box" | "master_job";

export interface MoneyBuyRow {
  category: string;
  estQty: string | null;
  estAmount: string | null;
  estCurrency: string;
  realQty: string | null;
  realAmount: string | null;
  realCurrency: string;
  sourceTruckingRef: string | null;
  sourceMasterJobRef: string | null;
}

export interface MoneySellRow {
  id: string;
  qty: string | null;
  amount: string | null;
  currency: string;
  invoice: boolean;
}

/**
 * The basket of a buying line. A master job's share first: it is that box's cost, counted there.
 * Then inland delivery. Freight and local charges (ocean freight, fuel, CFS, THC, documents) are
 * what a box costs. The rest - customs, insurance, storage, a collection at origin, text typed
 * before the catalogue - is the shipment's own.
 */
export function basketOf(row: Pick<MoneyBuyRow, "category" | "sourceTruckingRef" | "sourceMasterJobRef">): CostBasket {
  if (row.sourceMasterJobRef) return "master_job";
  if (row.sourceTruckingRef || INLAND_DELIVERY_CODES.includes(toChargeCode(row.category))) return "inland";
  const group = chargeGroup(row.category);
  return group === "freight" || group === "locals" ? "box" : "other";
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function rateOf(currency: string, rates: CzkRates): number | null {
  if (!currency || currency === "CZK") return 1;
  const r = rates[currency];
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null;
}

/**
 * One shipment's money for Earnings, in CZK at the rates given (its own, as Costs Breakdown shows
 * it). `invoicedSellIds` are its selling rows an open invoice was made from.
 */
export function coLoadingMoney(buying: readonly MoneyBuyRow[], selling: readonly MoneySellRow[], rates: CzkRates, invoicedSellIds: ReadonlySet<string>): Omit<CoLoadingMoneyItem, "shipmentId"> {
  const missing = new Set<string>();
  const czk = (value: number, currency: string): number | null => {
    const rate = rateOf(currency || "CZK", rates);
    if (rate === null) {
      if (value !== 0) missing.add(currency);
      return null;
    }
    return value * rate;
  };

  const baskets: Record<CostBasket, number> = { inland: 0, other: 0, box: 0, master_job: 0 };
  let unrecognisedLines = 0;
  for (const r of buying) {
    const real = toNumber(r.realAmount) * qtyOrOne(r.realQty);
    const est = toNumber(r.estAmount) * qtyOrOne(r.estQty);
    const value = real ? czk(real, r.realCurrency || "CZK") : czk(est, r.estCurrency || "CZK");
    const basket = basketOf(r);
    // A line with a value that the catalogue does not know is counted as the shipment's own, and said to be so.
    if (basket === "other" && chargeGroup(r.category) === null && (real || est)) unrecognisedLines++;
    if (value !== null) baskets[basket] += value;
  }

  let sellingCzk = 0;
  let invoicedCzk = 0;
  let sellingLines = 0;
  let untickedLines = 0;
  for (const r of selling) {
    const amount = toNumber(r.amount) * qtyOrOne(r.qty);
    if (!amount) continue;
    if (!r.invoice) {
      untickedLines++;
      continue;
    }
    sellingLines++;
    const value = czk(amount, r.currency || "CZK");
    if (value === null) continue;
    sellingCzk += value;
    if (invoicedSellIds.has(r.id)) invoicedCzk += value;
  }

  return {
    sellingCzk: round2(sellingCzk),
    invoicedCzk: round2(invoicedCzk),
    inlandCzk: round2(baskets.inland),
    otherCzk: round2(baskets.other),
    ownBoxCzk: round2(baskets.box),
    masterJobCzk: round2(baskets.master_job),
    sellingLines,
    untickedLines,
    unrecognisedLines,
    missingCurrencies: [...missing].sort(),
    eurRate: rateOf("EUR", rates),
  };
}
