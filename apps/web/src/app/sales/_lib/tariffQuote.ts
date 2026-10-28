import { toChargeCode } from "@/lib/chargeCodes";
import { quoteContainerCount, withRate } from "./salesQuote";
import type { CostLine, SalesQuoteData } from "./types";

// What the suppliers' tariffs that price a quote's buying lines (rail, collections, ocean) have in
// common on a quote: the line a tariff can price, the tariff version a priced line came from, the
// ranking and narrowing of the offers, and how a picked offer's lines take the place of the line
// it was picked on.

/** Whether a line is for the charge `code`: by its charge code, or by the label of an older line. */
export const isChargeLine = (line: Pick<CostLine, "chargeCode" | "type">, code: string) => (line.chargeCode || toChargeCode(line.type)) === code;

/** Whether a line was priced from a tariff whose tariffRef starts with `prefix` ("rail:", "ocean:"). */
export const hasTariffRef = (line: Pick<CostLine, "tariffRef">, prefix: string) => !!line.tariffRef?.startsWith(prefix);

/** The tariff version of a line priced with `prefix` ("<prefix><versionId>[:<rateId>]"), or null for any other line. */
export function tariffRefVersionId(line: Pick<CostLine, "tariffRef">, prefix: string): string | null {
  if (!line.tariffRef || !hasTariffRef(line, prefix)) return null;
  return line.tariffRef.slice(prefix.length).split(":")[0] || null;
}

/** A postcode written in an address: three and two digits, with or without a space between. */
export const ADDRESS_POSTCODE = /(?:^|\D)(\d{3}) ?(\d{2})(?!\d)/;

/** An amount in the quote's currency; null when there is no rate for the currency. */
export type ToQuoteCurrency = (amount: number, currency: string) => number | null;

/** The offers from the cheapest in the quote's currency, so offers in other currencies compare fairly; one without a rate goes last. */
export function rankOffers<T>(offers: readonly T[], inQuoteCurrency: (offer: T) => number | null): T[] {
  return [...offers].sort((a, b) => (inQuoteCurrency(a) ?? Infinity) - (inQuoteCurrency(b) ?? Infinity));
}

/** An offer's total in the quote's currency; null when there is no rate for the offer's currency. */
export const offerInQuoteCurrency = (offer: { total: number; currency: string }, quoteCurrency: string, toQuoteCurrency: ToQuoteCurrency) =>
  offer.currency === quoteCurrency ? offer.total : toQuoteCurrency(offer.total, offer.currency);

/** The terminals (transshipment ports) the offers run via, by name, with how many offers run via each. */
export function offerTerminals(offers: readonly { via: string }[]): { via: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const o of offers) counts.set(o.via, (counts.get(o.via) ?? 0) + 1);
  return [...counts].map(([via, count]) => ({ via, count })).sort((a, b) => a.via.localeCompare(b.via, "cs"));
}

/** The offers via the chosen terminals, in their order; all of them while none of the chosen is among them. */
export function viaTerminals<T extends { via: string }>(offers: T[], chosen: string[]): T[] {
  const wanted = new Set(chosen.filter((via) => offers.some((o) => o.via === via)));
  return wanted.size ? offers.filter((o) => wanted.has(o.via)) : offers;
}

/** What an offer asks for the containers of one type. */
interface ContainerPrice {
  type: string;
  qty: number;
  price: number;
  amount: number;
}

/**
 * The freight lines a picked offer makes of `base` (the picked line with the offer's supplier,
 * currency and tariffRef on it). One line per container when every container costs the same and
 * the offer prices all of the quote's containers (the quote's containers its quantity); otherwise
 * one lump-sum line per container type, priced as number × price, of which only the first keeps the
 * pairing with a selling line the picked line had.
 */
export function containerFreightLines(base: CostLine, description: string, prices: readonly ContainerPrice[], quote: SalesQuoteData): CostLine[] {
  const distinct = new Set(prices.map((l) => l.price));
  const counted = prices.reduce((sum, l) => sum + l.qty, 0);
  const containers = quoteContainerCount(quote);
  if (distinct.size === 1 && counted === containers) return [withRate({ ...base, description, basis: "container" }, prices[0]!.price, containers)];
  return prices.map((l, i) => {
    const sized: CostLine = { ...base, description: `${description} - ${l.qty} × ${l.type}`, basis: "lumpsum", amount: l.amount, qty: l.qty, unit: l.type, unitPrice: l.price };
    delete sized.value;
    if (i > 0) delete sized.pairId;
    return sized;
  });
}

/** The buying lines after a pick, and where they changed, so the rows' React keys can follow. */
export interface TariffPick {
  lines: CostLine[];
  /** Indexes (in the lines before) of the lines an earlier pick on the line made, now gone */
  removed: number[];
  /** Where the offer's lines start in the new lines, and how many there are */
  at: number;
  count: number;
}

/**
 * The buying lines with an offer's lines (`priced`, made of the picked line) put on line `index`:
 * they take that line's place, and the lines an earlier pick on it made (the same tariffRef, of a
 * tariff with `prefix`) go, so picking again replaces them.
 */
export function withTariffLines(lines: CostLine[], index: number, prefix: string, priced: (picked: CostLine) => CostLine[]): TariffPick {
  const picked = lines[index];
  if (!picked) return { lines, removed: [], at: index, count: 0 };
  const earlier = hasTariffRef(picked, prefix) ? picked.tariffRef : null;
  const removed = earlier ? lines.flatMap((l, i) => (i !== index && l.tariffRef === earlier ? [i] : [])) : [];
  const offerLines = priced(picked);
  const kept = (i: number) => !removed.includes(i);
  const before = lines.slice(0, index).filter((_, i) => kept(i));
  const after = lines.slice(index + 1).filter((_, i) => kept(index + 1 + i));
  return { lines: [...before, ...offerLines, ...after], removed, at: before.length, count: offerLines.length };
}
