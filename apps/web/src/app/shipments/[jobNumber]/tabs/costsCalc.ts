/**
 * Costs Breakdown calculations.
 *
 * Rules:
 *  - a row = quantity × unit price; an empty quantity counts as 1
 *  - conversions always go through CZK, with the job's ČNB rates (fx service)
 *  - buying counts the real cost once its amount is filled in, even when it comes to 0, and the
 *    estimate only while the real amount is blank (realCounts; the server's lib/jobCostTotals countedCost)
 *  - "R x E" = Real − Estimated, only when both are filled in (an estimate or a real cost of 0 too)
 *
 * A currency without a rate is NEVER converted at 1 — such a row would be added silently at
 * the wrong amount. It is left out of the totals instead and reported in missingCurrencies,
 * so the user can be told. Only the side that counts needs its rate for a buying row's total, as
 * on the server: a row counting its real cost whose estimate has no rate stays in the totals,
 * and only its estimate is left out - of the Est. total and of Real − Estimated and its marks
 * (estimateMissingCurrencies, estimateLeftOutCount). A buying amount of 0 needs no rate.
 *
 * Each row's total in the billing currency is rounded to cents, as the row shows it, and the totals
 * add up those rounded rows, so a total is always the sum of the figures printed above it (User Council
 * O19, A17). The CZK figures (the Report bar, the "… CZK" line under Total selling, the profit set against
 * the quote) are not taken back from those totals: a 1,000 CZK cost on a EUR-billed job, rounded to
 * 39.53 EUR, came back as 1,000.11 CZK. They add up each row's own CZK value instead and round the sum to
 * haléř, as the server's job profit does (invoicing lib/jobCostTotals), so the bar, the Money tab and the
 * job profit report give one figure (mock council S7-1). The bar and the line under the total still read
 * the same haléř (B23): both are the one sum.
 */

import { chargeLabel } from "@/lib/chargeCodes";
import { amountFilledIn, money, num, round2 } from "@/lib/money";

/**
 * The quantity of a cost or selling row: a blank quantity means 1 (a lump sum), but a 0 typed on
 * purpose stays 0 - that row then adds nothing (Council Review 7, K19). The server holds the same
 * rule (api invoicing lib/invoiceCalc qtyOrOne), so the Costs tab's totals agree with invoices (the
 * selling lines), the job's cost totals (lib/jobCostTotals), Operations money, a sailing's Earnings
 * and the Job Profit report. A real cost at quantity 0 is a real cost of 0: its amount is filled in,
 * so it counts, here as in all of them, and the estimate does not (realCounts).
 */
export function qtyOrOne(v: string | number | null | undefined): number {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return 1;
  return num(v);
}

// num() and money() live in the shared @/lib/money; re-exported so existing imports keep working.
export { num, money } from "@/lib/money";

export type Rates = Record<string, number>;

/**
 * Whether a buying row's real cost counts: once its amount is filled in (not blank), even when the row comes to 0 -
 * an amount of 0, or a quantity of 0. Until then its estimate counts. The server's rule (lib/jobCostTotals realCounts).
 */
export const realCounts = (r: Pick<BuyingRow, "realAmount">): boolean => amountFilledIn(r.realAmount);

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
  /** The Customer Database supplier the vendor names when it was picked (or came so from the quote); null when only typed. */
  supplierCustomerId: string | null;
  estQty: string;
  estAmount: string;
  estCurrency: string;
  realQty: string;
  realAmount: string;
  realCurrency: string;
  invoiceNumber: string;
  received: boolean;
  /** When Received was ticked (ISO); null while not received, or for a line received before this was kept. */
  receivedAt: string | null;
  /** The day it was paid (yyyy-mm-dd); "" while unpaid. */
  paidOn: string;
  /** Who noted it paid (e-mail) and when (ISO); "" / null while unpaid. */
  paidBy: string;
  paidAt: string | null;
  /** The supplier invoice on Finance → Accounts Payable the line is on (once it has an invoice number); null
   *  otherwise. Its payment is noted there, for the whole invoice (Council Outlay 9, D11). */
  supplierInvoiceId: string | null;
  /** On a billed shipment: its real cost came after the billing and its supplier invoice is not yet approved or
   *  paid, so it stays open to be put right (mock council M1; the server's lib/billedLock). */
  lateRealCostOpen?: boolean;
}

export interface SellingRow {
  id: string;
  category: string;
  /** What the cost is for, in the user's words - the description of the quote line it was copied from.
   *  Shown as "Invoice text": the invoice line prints it unless the row has a text of its own (`customer`). */
  description: string;
  /** The invoice line's own text, set in Issue invoice. The line prints it; empty, the row's
   *  Description, else the category. */
  customer: string;
  qty: string;
  amount: string;
  currency: string;
  invoice: boolean;
  /** link to the buying row it was copied from */
  sourceBuyId: string | null;
  /** When the row was added (ISO): on a billed shipment, before or after its first invoice. */
  createdAt?: string;
  /** The partial credit note that put this negative row on the shipment; null otherwise. */
  sourceCreditNoteId?: string | null;
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
  /** A row in the totals has its real amount filled in: the Real total is there, even when it is 0. */
  hasReal: boolean;
  /** costs: Σ of each row's Real once its amount is filled in (even at 0), its Est. only while that is blank */
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
  /**
   * Currencies without a rate of estimates beside a real cost: those rows stay in the totals at their real cost, and
   * only their estimate is left out - of the Est. total, of Real − Estimated and of the over / under marks.
   */
  estimateMissingCurrencies: string[];
  /** Number of rows whose estimate is left out so. */
  estimateLeftOutCount: number;
}

export function computeCosts(
  buying: BuyingRow[],
  selling: SellingRow[],
  billingCur: string,
  rates: Rates,
): CostsTotals {
  const missing = new Set<string>();
  let unconvertibleRowCount = 0;
  const estimateMissing = new Set<string>();
  let estimateLeftOutCount = 0;

  const billingRate = rateOf(billingCur, rates);
  if (billingRate === null) missing.add(billingCur);

  /** Converts to the billing currency through CZK. null = a rate is missing on either side (named in `report`). */
  const conv = (value: number, currency: string, report: Set<string> = missing): number | null => {
    const from = rateOf(currency, rates);
    if (from === null) {
      report.add(currency);
      return null;
    }
    if (billingRate === null) return null;
    return (value * from) / billingRate;
  };
  /** A row's own value in CZK, unrounded (its rate is known: conv has said so). */
  const czkOf = (value: number, currency: string) => value * (rateOf(currency, rates) ?? 0);
  let buyCZKRaw = 0;
  let sellCZKRaw = 0;

  const buyRowTotals: Record<string, number | null> = {};
  const buyRowOver: Record<string, boolean> = {};
  const buyRowUnder: Record<string, boolean> = {};
  const rxeRows: RxeRow[] = [];

  let buyTotal = 0;
  let estTotal = 0;
  let realStrictTotal = 0;
  let hasReal = false;
  let rxeTotal = 0;
  let hasRxe = false;

  for (const r of buying) {
    // a row = quantity × unit price, an empty quantity = 1, a typed 0 = 0
    const est = num(r.estAmount) * qtyOrOne(r.estQty);
    const realFilled = realCounts(r);
    const real = realFilled ? num(r.realAmount) * qtyOrOne(r.realQty) : 0;
    // An amount of 0 needs no rate: a real cost of 0 in a currency without one keeps the row in the totals. An estimate
    // beside a real cost is not what the row counts, so its missing rate is named apart (estimateMissing).
    const estRaw = est ? conv(est, r.estCurrency, realFilled ? estimateMissing : missing) : 0;
    const realRaw = real ? conv(real, r.realCurrency) : 0;
    const estC = estRaw === null ? null : round2(estRaw);
    const realC = realRaw === null ? null : round2(realRaw);
    // the row's base: its Real Cost once its amount is filled in (even at 0), its Est. Amount only while that is blank
    const basis = realFilled ? realC : estC;
    buyRowOver[r.id] = false;
    buyRowUnder[r.id] = false;

    // A row whose side that counts can't be converted stays out of the totals.
    if (basis === null) {
      buyRowTotals[r.id] = null;
      unconvertibleRowCount += 1;
      continue;
    }

    buyTotal += basis;
    buyCZKRaw += realFilled ? czkOf(real, r.realCurrency) : czkOf(est, r.estCurrency);
    buyRowTotals[r.id] = basis;
    if (realFilled) {
      realStrictTotal += basis;
      hasReal = true;
    }

    // Its estimate without a rate (beside the real cost it counts): out of the Est. total, nothing to set the real cost against.
    if (estC === null) {
      estimateLeftOutCount += 1;
      continue;
    }
    estTotal += estC;

    // Real − Estimated and its marks: only when both are filled in, an estimate or a real cost of 0 too.
    if (amountFilledIn(r.estAmount) && realFilled) {
      buyRowOver[r.id] = basis - estC > 0.001;
      buyRowUnder[r.id] = estC - basis > 0.001;
      const d = basis - estC;
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
  let sellNotInvoicedTotal = 0;
  let sellNotInvoicedCount = 0;

  for (const r of selling) {
    const raw = num(r.amount) * qtyOrOne(r.qty);
    const converted = conv(raw, r.currency);
    const inBilling = converted === null ? null : round2(converted);

    if (inBilling === null) {
      sellRowTotals[r.id] = null;
      unconvertibleRowCount += 1;
      continue;
    }

    sellRowTotals[r.id] = inBilling;

    // The Invoice column says whether a row goes on the invoice.
    // An unticked row doesn't count in revenue (and so not in profit either).
    if (r.invoice) {
      sellTotal += inBilling;
      sellCZKRaw += czkOf(raw, r.currency);
    } else {
      sellNotInvoicedTotal += inBilling;
      sellNotInvoicedCount += 1;
    }
  }

  // The sums of rounded rows, rid of the float residue of adding them up (0.1 + 0.2).
  buyTotal = round2(buyTotal);
  estTotal = round2(estTotal);
  realStrictTotal = round2(realStrictTotal);
  sellTotal = round2(sellTotal);
  sellNotInvoicedTotal = round2(sellNotInvoicedTotal);

  // Totals in CZK: the sum of the rows' own CZK values, rounded to haléř, as jobCostTotals has them (S7-1). Without
  // the billing currency's rate no row was counted, so they stay 0, as before.
  const buyCZK = round2(buyCZKRaw);
  const sellCZK = round2(sellCZKRaw);

  return {
    buyRowTotals,
    buyRowOver,
    buyRowUnder,
    estTotal,
    realStrictTotal,
    hasReal,
    buyTotal,
    sellRowTotals,
    sellTotal,
    // the same figure as the Report bar's selling total, so the two never differ by a haléř
    sellTotalCZK: sellCZK,
    sellNotInvoicedTotal,
    sellNotInvoicedCount,
    buyCZK,
    sellCZK,
    // from the unrounded sums, as the server's profitCzk
    profitCZK: round2(sellCZKRaw - buyCZKRaw),
    hasAny: buyCZK !== 0 || sellCZK !== 0,
    rxeTotal,
    rxeRows,
    hasRxe,
    missingCurrencies: [...missing].sort(),
    unconvertibleRowCount,
    estimateMissingCurrencies: [...estimateMissing].sort(),
    estimateLeftOutCount,
  };
}

/** signed form for R x E: +/− and the absolute value */
export function signed(v: number): string {
  return (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v));
}
