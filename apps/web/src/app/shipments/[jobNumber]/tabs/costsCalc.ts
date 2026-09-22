/**
 * Vypocty pro Costs Breakdown - dle recalcCosts() z HTML mockupu.
 *
 * Klicova pravidla z mockupu:
 *  - radek = mnozstvi x jednotkova cena; prazdne mnozstvi se bere jako 1
 *  - prepocty jdou vzdy pres CZK, kurzy pochazi z kurzovniho listku (Exchange)
 *  - zaklad radku je Real Cost, dokud neni vyplnen, pouzije se Est. Amount
 *  - "R x E" = Real - Estimated, pocita se jen kdyz je vyplneno oboji
 *
 * Mena bez kurzu se NIKDY neprepocitava kurzem 1 - takovy radek by se tise
 * pricetl ve spatne vysi. Misto toho se z vypoctu vynecha a nahlasi se v
 * missingCurrencies, aby na nej slo uzivatele upozornit.
 */

export type Rates = Record<string, number>;

/**
 * num() z mockupu - tolerantni parsovani cisel.
 * Zvlada desetinnou carku i tecku vcetne oddelovace tisicu:
 * "1 234,56" i "1,234.56" -> 1234.56. Pri obou oddelovacich plati ten posledni.
 */
export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const cleaned = String(v ?? "").replace(/[^0-9.,-]/g, "");
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalised: string;
  if (lastComma > -1 && lastDot > -1) {
    // oba oddelovace - posledni je desetinny, ten druhy oddeluje tisice
    const decimalAt = Math.max(lastComma, lastDot);
    normalised =
      cleaned.slice(0, decimalAt).replace(/[.,]/g, "") + "." + cleaned.slice(decimalAt + 1).replace(/[.,]/g, "");
  } else {
    // jen jeden oddelovac - bereme ho jako desetinny (bezne zadani u nas)
    normalised = cleaned.replace(",", ".");
  }

  const parsed = parseFloat(normalised);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** money() z mockupu - dve desetinna mista s oddelovacem tisicu */
export function money(v: number): string {
  return (Number.isFinite(v) ? v : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Kurz meny vuci CZK. null = pro tuto menu kurz nemame. */
function rateOf(currency: string, rates: Rates): number | null {
  if (!currency || currency === "CZK") return 1;
  const r = rates[currency];
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null;
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
  /** vazba na zdrojovy buying radek (mockup: data-src) */
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
  /** Soucet radku v billing mene; null = mena radku nema kurz. */
  buyRowTotals: Record<string, number | null>;
  /** zvyrazneni: Real vyssi nez Est. (cervene) / nizsi (zelene) */
  buyRowOver: Record<string, boolean>;
  buyRowUnder: Record<string, boolean>;
  /** soucet Est. v billing mene */
  estTotal: number;
  /** soucet Real v billing mene, jen vyplnene radky */
  realStrictTotal: number;
  /** naklady: Sigma Real, fallback Est. */
  buyTotal: number;
  /** Soucet radku v billing mene; null = mena radku nema kurz. */
  sellRowTotals: Record<string, number | null>;
  /** Vynosy - JEN radky zaskrtnute k fakturaci (sloupec Invoice). */
  sellTotal: number;
  sellTotalCZK: number;
  /** Radky vynechane ze souctu, protoze nejsou zaskrtnute k fakturaci. */
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
  /** Meny bez kurzu, ktere se objevily v radcich - jejich radky jsou ze souctu vynechany. */
  missingCurrencies: string[];
  /** Pocet radku vynechanych kvuli chybejicimu kurzu. */
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

  /** Prevod do billing meny pres CZK. null = chybi kurz na nektere strane. */
  const conv = (value: number, currency: string): number | null => {
    const from = rateOf(currency, rates);
    if (from === null) {
      missing.add(currency);
      return null;
    }
    if (billingRate === null) return null;
    return (value * from) / billingRate;
  };

  /** Prevod do CZK. null = chybi kurz. */
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
    // radek = mnozstvi x jednotkova cena, prazdne mnozstvi = 1
    const est = num(r.estAmount) * (num(r.estQty) || 1);
    const real = num(r.realAmount) * (num(r.realQty) || 1);
    const estC = conv(est, r.estCurrency);
    const realC = real ? conv(real, r.realCurrency) : 0;

    // Radek, u ktereho neumime prepocitat pouzitou stranu, do souctu nevstupuje.
    if (estC === null || realC === null) {
      buyRowTotals[r.id] = null;
      buyRowOver[r.id] = false;
      buyRowUnder[r.id] = false;
      unconvertibleRowCount += 1;
      continue;
    }

    estTotal += estC;
    if (real) realStrictTotal += realC;

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
        id: r.id,
        cat: r.category || "(no category)",
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

    // Sloupec Invoice rika, zda radek jde do kalkulacniho listu k fakturaci.
    // Nezaskrtnuty radek se do vynosu (a tim i do zisku) nepocita.
    if (r.invoice) {
      sellTotal += inBilling;
      sellTotalCZK += inCZK;
    } else {
      sellNotInvoicedTotal += inBilling;
      sellNotInvoicedCount += 1;
    }
  }

  // Souhrny v CZK: z billing meny zpet pres jeji kurz.
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

/** znamenkovy zapis pro R x E: +/- a absolutni hodnota */
export function signed(v: number): string {
  return (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v));
}
