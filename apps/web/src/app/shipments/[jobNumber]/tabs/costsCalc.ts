/**
 * Vypocty pro Costs Breakdown - presne dle recalcCosts() z HTML mockupu.
 *
 * Klicova pravidla z mockupu:
 *  - radek = mnozstvi x jednotkova cena; prazdne mnozstvi se bere jako 1
 *  - prepocty jdou vzdy pres CZK: meny z kurzovniho listku CNB podle kurzu,
 *    ostatni meny pres zalozni rucni kurz ROE
 *  - zaklad radku je Real Cost, dokud neni vyplnen, pouzije se Est. Amount
 *  - "R x E" = Real - Estimated, pocita se jen kdyz je vyplneno oboji
 */

export type Rates = Record<string, number>;

/** num() z mockupu - tolerantni parsovani cisel (desetinna carka i tecka) */
export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const parsed = parseFloat(
    String(v ?? "").replace(/[^0-9.,-]/g, "").replace(",", "."),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

/** money() z mockupu - dve desetinna mista s oddelovacem tisicu */
export function money(v: number): string {
  return (Number.isFinite(v) ? v : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** prevod do CZK: kurz CNB, jinak zalozni ROE */
export function toCZK(v: number, currency: string, rates: Rates, roe: number): number {
  return currency === "CZK" ? v : v * (rates[currency] || roe);
}

/** prevod do zvolene billing meny (vzdy pres CZK) */
export function conv(v: number, currency: string, billingCur: string, rates: Rates, roe: number): number {
  const czk = toCZK(v, currency, rates, roe);
  return billingCur === "CZK" ? czk : czk / (rates[billingCur] || roe);
}

export interface BuyingRow {
  id: string;
  category: string;
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
  customer: string;
  qty: string;
  amount: string;
  currency: string;
  invoice: boolean;
}

export interface RxeRow {
  cat: string;
  vendor: string;
  delta: number;
  pct: number;
}

export interface CostsTotals {
  /** Total in CZK pro kazdy buying radek (klic = id) */
  buyRowTotals: Record<string, number>;
  /** zvyrazneni: Real vyssi nez Est. (cervene) / nizsi (zelene) */
  buyRowOver: Record<string, boolean>;
  buyRowUnder: Record<string, boolean>;
  /** soucet Est. v billing mene */
  estTotal: number;
  /** soucet Real v billing mene, jen vyplnene radky */
  realStrictTotal: number;
  /** soucty v CZK pro kurzovy prehled */
  estCZK: number;
  realCZK: number;
  /** naklady: Sigma Real, fallback Est. */
  buyTotal: number;
  /** Total in CZK pro kazdy selling radek */
  sellRowTotals: Record<string, number>;
  sellTotal: number;
  sellTotalCZK: number;
  /** Report */
  buyCZK: number;
  sellCZK: number;
  profitCZK: number;
  hasAny: boolean;
  /** Real - Estimated */
  rxeTotal: number;
  rxeRows: RxeRow[];
  hasRxe: boolean;
}

export function computeCosts(
  buying: BuyingRow[],
  selling: SellingRow[],
  billingCur: string,
  rates: Rates,
  roeInput: string | number,
): CostsTotals {
  const roe = num(roeInput) || 1;
  const c = (v: number, cur: string) => conv(v, cur, billingCur, rates, roe);
  const czk = (v: number, cur: string) => toCZK(v, cur, rates, roe);

  const buyRowTotals: Record<string, number> = {};
  const buyRowOver: Record<string, boolean> = {};
  const buyRowUnder: Record<string, boolean> = {};
  const rxeRows: RxeRow[] = [];

  let buyTotal = 0;
  let estTotal = 0;
  let realStrictTotal = 0;
  let estCZK = 0;
  let realCZK = 0;
  let rxeTotal = 0;
  let hasRxe = false;

  for (const r of buying) {
    // radek = mnozstvi x jednotkova cena, prazdne mnozstvi = 1
    const est = num(r.estAmount) * (num(r.estQty) || 1);
    const real = num(r.realAmount) * (num(r.realQty) || 1);
    const estC = c(est, r.estCurrency);
    const realC = c(real, r.realCurrency);

    estTotal += estC;
    estCZK += czk(est, r.estCurrency);
    if (real) {
      realCZK += czk(real, r.realCurrency);
      realStrictTotal += realC;
    }

    // zaklad radku: Real Cost, dokud neni -> Est. Amount
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
        cat: r.category || "(bez kategorie)",
        vendor: r.vendor.trim(),
        delta: d,
        pct: estC ? (d / estC) * 100 : 0,
      });
    }
  }

  const sellRowTotals: Record<string, number> = {};
  let sellTotal = 0;
  let sellTotalCZK = 0;
  for (const r of selling) {
    const raw = num(r.amount) * (num(r.qty) || 1);
    const t = c(raw, r.currency);
    sellTotal += t;
    sellTotalCZK += czk(raw, r.currency);
    sellRowTotals[r.id] = t;
  }

  const bcToCZK = (v: number) => (billingCur === "CZK" ? v : v * (rates[billingCur] || roe));
  const buyCZK = bcToCZK(buyTotal);
  const sellCZK = bcToCZK(sellTotal);

  return {
    buyRowTotals,
    buyRowOver,
    buyRowUnder,
    estTotal,
    realStrictTotal,
    estCZK,
    realCZK,
    buyTotal,
    sellRowTotals,
    sellTotal,
    sellTotalCZK,
    buyCZK,
    sellCZK,
    profitCZK: sellCZK - buyCZK,
    hasAny: buyCZK !== 0 || sellCZK !== 0,
    rxeTotal,
    rxeRows,
    hasRxe,
  };
}

/** znamenkovy zapis pro R x E: +/- a absolutni hodnota */
export function signed(v: number): string {
  return (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v));
}
