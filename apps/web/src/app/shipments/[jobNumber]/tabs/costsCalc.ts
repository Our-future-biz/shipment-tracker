/**
 * Costs Breakdown calculations.
 *
 * Rules:
 *  - a row = quantity × unit price; an empty quantity counts as 1
 *  - conversions always go through CZK, with the job's ČNB rates (fx service)
 *  - a row's base is its Real Cost; until that is filled in, its Est. Amount
 *  - "R x E" = Real − Estimated, only when both are filled in
 *
 * A currency without a rate is NEVER converted at 1 — such a row would be added silently at
 * the wrong amount. It is left out of the totals instead and reported in missingCurrencies,
 * so the user can be told.
 */

import { chargeLabel } from "@/lib/chargeCodes";
import { money, num } from "@/lib/money";

// num() and money() live in the shared @/lib/money; re-exported so existing imports keep working.
export { num, money } from "@/lib/money";

export type Rates = Record<string, number>;

/** A currency's rate against CZK. null = no rate for this currency. */
function rateOf(currency: string, rates: Rates): number | null {
  if (!currency || currency === "CZK") return 1;
  const r = rates[currency];
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null;
}

export interface BuyingRow {
  id: string;
  category: string;
  /** What the cost is for, in the user's words - the description of the quote line it was copied from. */
  description: string;
  vendor: string;
  estQty: string;
  estAmount: string;
  estCurrency: string;
  realQty: string;
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
  received: boolean;
}

export interface SellingRow {
  id: string;
  category: string;
  /** What the cost is for, in the user's words - the description of the quote line it was copied from. */
  description: string;
  /** the "Invoice text" column: the line text on the invoice; empty = the category */
  customer: string;
  qty: string;
  amount: string;
  currency: string;
  invoice: boolean;
  /** link to the buying row it was copied from */
  sourceBuyId: string | null;
}

export interface RxeRow {
  id: string;
  cat: string;
  vendor: string;
  delta: number;
  pct: number;
}

export interface CostsTotals {
  /** The row's total in the billing currency; null = the row's currency has no rate. */
  buyRowTotals: Record<string, number | null>;
  /** highlight: Real above Est. (red) / below (green) */
  buyRowOver: Record<string, boolean>;
  buyRowUnder: Record<string, boolean>;
  /** total of Est. in the billing currency */
  estTotal: number;
  /** total of Real in the billing currency, filled rows only */
  realStrictTotal: number;
  /** costs: Σ Real, falling back to Est. */
  buyTotal: number;
  /** The row's total in the billing currency; null = the row's currency has no rate. */
  sellRowTotals: Record<string, number | null>;
  /** Revenue — ONLY rows ticked for invoicing (Invoice column). */
  sellTotal: number;
  sellTotalCZK: number;
  /** Rows left out of the totals because they are not ticked for invoicing. */
  sellNotInvoicedTotal: number;
  sellNotInvoicedCount: number;
  /** Report */
  buyCZK: number;
  sellCZK: number;
  profitCZK: number;
  hasAny: boolean;
  /** Real - Estimated */
  rxeTotal: number;
  rxeRows: RxeRow[];
  hasRxe: boolean;
  /** Currencies without a rate found in the rows — those rows are left out of the totals. */
  missingCurrencies: string[];
  /** Number of rows left out for a missing rate. */
  unconvertibleRowCount: number;
}

export function computeCosts(
  buying: BuyingRow[],
  selling: SellingRow[],
  billingCur: string,
  rates: Rates,
): CostsTotals {
  const missing = new Set<string>();
  let unconvertibleRowCount = 0;

  const billingRate = rateOf(billingCur, rates);
  if (billingRate === null) missing.add(billingCur);

  /** Converts to the billing currency through CZK. null = a rate is missing on either side. */
  const conv = (value: number, currency: string): number | null => {
    const from = rateOf(currency, rates);
    if (from === null) {
      missing.add(currency);
      return null;
    }
    if (billingRate === null) return null;
    return (value * from) / billingRate;
  };

  /** Converts to CZK. null = the rate is missing. */
  const toCZK = (value: number, currency: string): number | null => {
    const from = rateOf(currency, rates);
    if (from === null) {
      missing.add(currency);
      return null;
    }
    return value * from;
  };

  const buyRowTotals: Record<string, number | null> = {};
  const buyRowOver: Record<string, boolean> = {};
  const buyRowUnder: Record<string, boolean> = {};
  const rxeRows: RxeRow[] = [];

  let buyTotal = 0;
  let estTotal = 0;
  let realStrictTotal = 0;
  let rxeTotal = 0;
  let hasRxe = false;

  for (const r of buying) {
    // a row = quantity × unit price, an empty quantity = 1
    const est = num(r.estAmount) * (num(r.estQty) || 1);
    const real = num(r.realAmount) * (num(r.realQty) || 1);
    const estC = conv(est, r.estCurrency);
    const realC = real ? conv(real, r.realCurrency) : 0;

    // A row whose side in use can't be converted stays out of the totals.
    if (estC === null || realC === null) {
      buyRowTotals[r.id] = null;
      buyRowOver[r.id] = false;
      buyRowUnder[r.id] = false;
      unconvertibleRowCount += 1;
      continue;
    }

    estTotal += estC;
    if (real) realStrictTotal += realC;

    // the row's base: Real Cost, until it is filled in -> Est. Amount
    const basis = real ? realC : estC;
    buyTotal += basis;
    buyRowTotals[r.id] = basis;

    buyRowOver[r.id] = !!(est && real && realC - estC > 0.001);
    buyRowUnder[r.id] = !!(est && real && estC - realC > 0.001);

    if (est && real) {
      const d = realC - estC;
      rxeTotal += d;
      hasRxe = true;
      rxeRows.push({
        id: r.id,
        cat: chargeLabel(r.category) || "(no category)",
        vendor: r.vendor.trim(),
        delta: d,
        pct: estC ? (d / estC) * 100 : 0,
      });
    }
  }

  const sellRowTotals: Record<string, number | null> = {};
  let sellTotal = 0;
  let sellTotalCZK = 0;
  let sellNotInvoicedTotal = 0;
  let sellNotInvoicedCount = 0;

  for (const r of selling) {
    const raw = num(r.amount) * (num(r.qty) || 1);
    const inBilling = conv(raw, r.currency);
    const inCZK = toCZK(raw, r.currency);

    if (inBilling === null || inCZK === null) {
      sellRowTotals[r.id] = null;
      unconvertibleRowCount += 1;
      continue;
    }

    sellRowTotals[r.id] = inBilling;

    // The Invoice column says whether a row goes on the invoice.
    // An unticked row doesn't count in revenue (and so not in profit either).
    if (r.invoice) {
      sellTotal += inBilling;
      sellTotalCZK += inCZK;
    } else {
      sellNotInvoicedTotal += inBilling;
      sellNotInvoicedCount += 1;
    }
  }

  // Totals in CZK: from the billing currency back through its rate.
  const bcToCZK = (v: number) => (billingRate === null ? 0 : v * billingRate);
  const buyCZK = bcToCZK(buyTotal);
  const sellCZK = bcToCZK(sellTotal);

  return {
    buyRowTotals,
    buyRowOver,
    buyRowUnder,
    estTotal,
    realStrictTotal,
    buyTotal,
    sellRowTotals,
    sellTotal,
    sellTotalCZK,
    sellNotInvoicedTotal,
    sellNotInvoicedCount,
    buyCZK,
    sellCZK,
    profitCZK: sellCZK - buyCZK,
    hasAny: buyCZK !== 0 || sellCZK !== 0,
    rxeTotal,
    rxeRows,
    hasRxe,
    missingCurrencies: [...missing].sort(),
    unconvertibleRowCount,
  };
}

/** signed form for R x E: +/− and the absolute value */
export function signed(v: number): string {
  return (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v));
}
