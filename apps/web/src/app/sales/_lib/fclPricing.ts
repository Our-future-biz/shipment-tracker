import { containerType } from "@/lib/cargo";
import { toChargeCode } from "@/lib/chargeCodes";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { roundCents } from "@/lib/money";
import { counterpartIndex, newPairId } from "./costPairs";
import { isTruckingLine } from "./roadQuote";
import { basisUnits, isContainerQuote, lineRate, perUnitBasis, quoteContainerCount, quoteCurrencyFactor, sellingRoeFactor, withRate, type LivePricing } from "./salesQuote";
import type { CostLine, FclBlockProfit, FclPricing, FclProfit, SalesQuoteData } from "./types";

// FCL pricing: how a Sea FCL quote is priced (the Pricing step's FCL layout). The buying lines are
// the charges, in blocks: one per container type, priced per container, and one for the charges per
// shipment (B/L fee and the like). Each block has a profit - a % of the selling price or a sum in
// the quote's currency, per container in a container block - which is put on its charges pro rata
// to their buying; the cents left over by rounding go to the ocean freight, so the charges always
// add up to the block's profit ("one profit"). "Edit per charge" sets the profit of each charge
// instead. Which charges take profit: in an all-in offer those in the all-in price (the others are
// offered at cost, on their own line); in a breakdown offer those ticked as profit basis.
//
// The selling lines are made from the buying lines and the profit, every time either changes: each
// takes its charge's currency, with its profit converted into it at the quote's rates (without the
// ROE %, which the totals add to lines in another currency as they always do). So the totals, the
// printed quotation, the reports and the shipment made from the quote read them as before, and
// each charge's profit stays stored on the quote: its selling line less its buying line.

/** The block of the charges per container of every type, on a quote with several types (a line from before types). */
export const ALL_CONTAINERS = "*";
/** The block of the charges per shipment. */
export const PER_SHIPMENT = "";

/**
 * A block's selling - per container in a container block, else per shipment - is rounded up to full
 * fives of the quote's currency (6,278.74 → 6,280, 6,273 → 6,275): what it takes is more profit, on the
 * charge the rounding cents go to (the ocean freight, else the dearest), one in the quote's currency first.
 */
export const SELLING_ROUNDS_TO = 5;

/** The highest profit % a charge can take: at 100 % of the selling price there is no price. */
export const MAX_PROFIT_PERCENT = 99;

// The charges that take profit in a breakdown offer until the user says otherwise: the freight.
const DEFAULT_PROFIT_BASIS = new Set(["ocean_freight", "inland_haulage"]);

const codeOf = (line: CostLine) => line.chargeCode || toChargeCode(line.type);

/** Whether a charge is part of the all-in price (it is unless taken out). */
export const isInAllIn = (line: CostLine): boolean => line.inAllIn !== false;
/** Whether profit is put on a charge in a breakdown offer: as ticked, else the freight. */
export const isProfitBasis = (line: CostLine): boolean => line.profitBasis ?? DEFAULT_PROFIT_BASIS.has(codeOf(line));
/** Whether a charge takes profit in this offer. */
export const takesProfit = (line: CostLine, allIn: boolean): boolean => (allIn ? isInAllIn(line) : isProfitBasis(line));

// Trucking lines are priced by the trucking tariffs, selling included: FCL pricing leaves them be.
const priceable = (line: CostLine) => !isTruckingLine(line);

/** Whether a quote is priced in the FCL layout: every Sea FCL quote, except one sent before the layout, which stays as it was sent. */
export function usesFclPricing(data: SalesQuoteData, pricingClosed: boolean): boolean {
  return isContainerQuote(data) && (!!data.fclPricing || !pricingClosed);
}

/** One block of FCL pricing. */
export interface FclBlock {
  key: string;
  /** "20' DC", "All containers", "Per shipment". */
  label: string;
  /** Whether its charges are per container (and its figures per container). */
  perContainer: boolean;
  /** Its containers; 1 for the charges per shipment. */
  units: number;
  /** The cargo weight per container (kg) of each of its container lines that gives one. */
  weights: number[];
  /** Its charges: indexes into the buying lines. */
  lines: number[];
}

// The container types of the quote, in the order of its container lines.
function quoteTypes(data: SalesQuoteData): string[] {
  const types: string[] = [];
  for (const c of data.containers ?? []) {
    const type = containerType(c.type);
    if (type && (Number(c.qty) || 0) > 0 && !types.includes(type)) types.push(type);
  }
  return types;
}

/** The block a buying line belongs to. */
export function blockKeyOf(line: CostLine, types: readonly string[]): string {
  if (line.basis !== "container") return PER_SHIPMENT;
  const type = line.containerType ? containerType(line.containerType) : "";
  if (type) return type;
  return types.length === 1 ? types[0]! : ALL_CONTAINERS;
}

/** The blocks of a quote: one per container type of its cargo, then any its lines have besides, then the charges per shipment. */
export function fclBlocks(data: SalesQuoteData): FclBlock[] {
  const types = quoteTypes(data);
  const lines = data.buyingLines ?? [];
  const keys = [...types];
  lines.forEach((line) => {
    const key = blockKeyOf(line, types);
    if (priceable(line) && key !== PER_SHIPMENT && !keys.includes(key)) keys.push(key);
  });
  keys.push(PER_SHIPMENT);
  return keys.map((key) => {
    const perContainer = key !== PER_SHIPMENT;
    const boxes = (data.containers ?? []).filter((c) => key === ALL_CONTAINERS || containerType(c.type) === key);
    return {
      key,
      label: key === PER_SHIPMENT ? "Per shipment" : key === ALL_CONTAINERS ? "All containers" : key,
      perContainer,
      units: !perContainer ? 1 : key === ALL_CONTAINERS ? quoteContainerCount(data) : quoteContainerCount(data, key),
      weights: perContainer ? boxes.map((c) => Number(c.weight) || 0).filter((w) => w > 0) : [],
      lines: lines.flatMap((line, i) => (priceable(line) && blockKeyOf(line, types) === key ? [i] : [])),
    };
  });
}

/** A block's profit as set, or none yet (0 %). */
export const blockProfitOf = (data: SalesQuoteData, key: string): FclBlockProfit => data.fclPricing?.blocks[key] ?? { mode: "percent", value: 0 };

/** The profit that makes `percent` of the selling price on a buying of `buying`. */
export function percentProfit(buying: number, percent: number): number {
  if (!(percent < 100)) return 0;
  return roundCents((buying * percent) / (100 - percent));
}

/** One charge of a block as priced: per container in a container block, in the quote's currency. */
export interface FclChargePrice {
  /** Its index in the buying lines. */
  index: number;
  takesProfit: boolean;
  /** Its buying; null when no rate converts its currency. */
  buying: number | null;
  profit: number;
  /** What the ROE % (the FX buffer) adds to its selling: a charge in another currency than the quote's; 0 otherwise. */
  roe: number;
  /** Its selling as the totals and the quotation have it: buying + profit + ROE. */
  selling: number | null;
  /** Its profit in % of its selling price before the ROE, rounded to a whole number; null without a selling price. */
  percent: number | null;
}

/** A block as priced: its charges and their sums, per container in a container block. */
export interface FclBlockPrice {
  charges: FclChargePrice[];
  buying: number;
  profit: number;
  /** What the ROE % adds to its charges in another currency than the quote's. */
  roe: number;
  /** Buying + profit + ROE: what its charges come to on the totals and the quotation. */
  selling: number;
  /** Its profit in % of its selling price before the ROE, rounded to a whole number; null without one. */
  percent: number | null;
  /** No charge of it takes profit, so a profit set for it is put nowhere. */
  profitUnplaced: boolean;
}

const wholePercent = (profit: number, selling: number | null) => (selling ? Math.round((profit / selling) * 100) : null);

// A charge's buying as the block counts it, in its own currency: per container, or the whole line.
const ownBuying = (line: CostLine, block: FclBlock) => (block.perContainer ? lineRate(line) : Number(line.amount) || 0);

/**
 * A block priced: each charge's buying, profit and selling, and the block's. A charge in another
 * currency than the quote's is sold at the ROE % as every selling line is (convertLine), `live`'s
 * on a draft: its selling shows that, so the block adds up to what the totals and the quotation show.
 */
export function priceFclBlock(data: SalesQuoteData, sheet: ExchangeRates, block: FclBlock, live?: LivePricing): FclBlockPrice {
  const lines = data.buyingLines ?? [];
  const allIn = !!data.allIn;
  const setting = blockProfitOf(data, block.key);
  const charges: FclChargePrice[] = block.lines.map((index) => {
    const line = lines[index]!;
    const factor = quoteCurrencyFactor(line.currency, data, sheet);
    return { index, takesProfit: takesProfit(line, allIn), buying: factor === null ? null : roundCents(ownBuying(line, block) * factor), profit: 0, roe: 0, selling: null, percent: null };
  });
  const taking = charges.filter((c) => c.takesProfit && c.buying !== null);
  if (setting.perCharge) {
    for (const c of taking) {
      const own: FclProfit = lines[c.index]!.chargeProfit ?? { mode: setting.mode, value: setting.mode === "percent" ? setting.value : 0 };
      c.profit = own.mode === "sum" ? roundCents(Number(own.value) || 0) : percentProfit(c.buying!, Number(own.value) || 0);
    }
  } else {
    const buying = taking.reduce((sum, c) => sum + c.buying!, 0);
    const profit = setting.mode === "sum" ? roundCents(Number(setting.value) || 0) : percentProfit(buying, Number(setting.value) || 0);
    allocate(profit, taking, lines);
  }
  for (const c of charges) if (c.buying !== null) sell(c, lines[c.index]!, data, live);
  const blockSetsProfit = setting.perCharge || (Number(setting.value) || 0) !== 0;
  if (data.fclPricing?.roundUp && blockSetsProfit) roundSellingUp(charges, taking, lines, data, live);
  const sum = (pick: (c: FclChargePrice) => number | null) => roundCents(charges.reduce((s, c) => s + (pick(c) ?? 0), 0));
  const profit = sum((c) => c.profit);
  const roe = sum((c) => c.roe);
  const selling = sum((c) => c.selling);
  return {
    charges,
    buying: sum((c) => c.buying),
    profit,
    roe,
    selling,
    percent: wholePercent(profit, roundCents(selling - roe)),
    profitUnplaced: blockSetsProfit && taking.length === 0,
  };
}

// A charge's selling from its buying and profit: the ROE % on a charge in another currency than the quote's.
function sell(c: FclChargePrice, line: CostLine, data: SalesQuoteData, live?: LivePricing) {
  const sold = roundCents(c.buying! + c.profit);
  c.roe = roundCents(sold * (sellingRoeFactor(line.currency, data, live) - 1));
  c.selling = roundCents(sold + c.roe);
  c.percent = wholePercent(c.profit, sold);
}

// The block's selling up to full fives (SELLING_ROUNDS_TO), the difference put on the charge the rounding
// cents go to as more profit; with the ROE % on it, the cents it rounds to are made up one at a time.
function roundSellingUp(charges: FclChargePrice[], taking: FclChargePrice[], lines: readonly CostLine[], data: SalesQuoteData, live?: LivePricing) {
  if (!taking.length) return;
  const total = () => roundCents(charges.reduce((s, c) => s + (c.selling ?? 0), 0));
  // In whole cents, so 6,275.01 goes to 6,280 and 6,275.00 stays.
  const target = (Math.ceil(Math.round(total() * 100) / (SELLING_ROUNDS_TO * 100)) * SELLING_ROUNDS_TO);
  if (total() >= target) return;
  const inQuoteCurrency = taking.filter((c) => sellingRoeFactor(lines[c.index]!.currency, data, live) === 1);
  const pool = inQuoteCurrency.length ? inQuoteCurrency : taking;
  const anchor = pool.find((c) => codeOf(lines[c.index]!) === "ocean_freight") ?? pool.reduce((best, c) => (c.buying! > best.buying! ? c : best), pool[0]!);
  const line = lines[anchor.index]!;
  anchor.profit = roundCents(anchor.profit + (target - total()) / sellingRoeFactor(line.currency, data, live));
  sell(anchor, line, data, live);
  for (let cents = 0; total() < target && cents < 100; cents++) {
    anchor.profit = roundCents(anchor.profit + 0.01);
    sell(anchor, line, data, live);
  }
}

// The block's profit on the charges that take it, pro rata to their buying, each to the cent; what
// rounding leaves goes to the ocean freight (else the dearest charge), so they add up to it.
function allocate(profit: number, charges: FclChargePrice[], lines: readonly CostLine[]) {
  if (!charges.length || !profit) return;
  const buying = charges.reduce((sum, c) => sum + c.buying!, 0);
  for (const c of charges) c.profit = buying > 0 ? roundCents((profit * c.buying!) / buying) : 0;
  const anchor =
    charges.find((c) => codeOf(lines[c.index]!) === "ocean_freight") ?? charges.reduce((best, c) => (c.buying! > best.buying! ? c : best), charges[0]!);
  anchor.profit = roundCents(anchor.profit + profit - charges.reduce((sum, c) => sum + c.profit, 0));
}

// What a selling line does not take from its buying line.
function sellingCopy(line: CostLine): CostLine {
  const copy: CostLine = { ...line, inAllIn: isInAllIn(line) };
  delete copy.supplier;
  delete copy.supplierCustomerId;
  delete copy.profitBasis;
  delete copy.chargeProfit;
  return copy;
}

// The buying lines FCL pricing prices, each with a pairId (its selling line takes it). Trucking
// lines are left as they are: their selling lines are the trucking tariffs', paired with them as
// they always were.
const withPairIds = (lines: readonly CostLine[]): CostLine[] => lines.map((l) => (l.pairId || !priceable(l) ? l : { ...l, pairId: newPairId() }));

/**
 * The selling lines of an FCL-priced quote, made from its buying lines (which all get a pairId) and
 * its profit; its trucking lines stay as they are. A charge priced at nothing sells nothing and has
 * no selling line. Null while a rate a charge needs is missing: its profit could not be converted.
 * `live`: the ROE % of a draft (one not sent has no rates of its own), so a block rounded up to fives
 * is rounded at the ROE its totals and quotation are shown at, as its card is.
 */
export function fclLines(data: SalesQuoteData, sheet: ExchangeRates, live?: LivePricing): Pick<SalesQuoteData, "buyingLines" | "sellingLines"> | null {
  const buyingLines = withPairIds(data.buyingLines ?? []);
  const quote = { ...data, buyingLines };
  const selling = new Map<number, CostLine>();
  for (const block of fclBlocks(quote)) {
    const priced = priceFclBlock(quote, sheet, block, live);
    for (const c of priced.charges) {
      const line = buyingLines[c.index]!;
      const factor = quoteCurrencyFactor(line.currency, quote, sheet);
      if (factor === null || c.buying === null) return null;
      const units = basisUnits(quote, line.basis, line.containerType);
      const own = ownBuying(line, block) + c.profit / factor;
      // Per container (or per W/M) the rate is the selling's; per shipment the whole line.
      const rate = block.perContainer ? roundCents(own) : perUnitBasis(line.basis) ? (units > 0 ? roundCents(own / units) : lineRate(line)) : roundCents(own);
      const sold = withRate(sellingCopy(line), rate, units);
      if (Number(sold.amount) || lineRate(sold)) selling.set(c.index, sold);
    }
  }
  const trucking = (data.sellingLines ?? []).filter(isTruckingLine);
  return { buyingLines, sellingLines: [...buyingLines.flatMap((_, i) => (selling.has(i) ? [selling.get(i)!] : [])), ...trucking] };
}

/** One row of the rate offer on the customer's quotation. */
export interface OfferRow {
  label: string;
  amount: number | null;
}

// A charge's name for the customer, with its containers when it is charged per container of a type.
function chargeName(line: CostLine, data: SalesQuoteData): string {
  const name = line.description?.trim() || line.type;
  if (line.basis !== "container" || !line.containerType || name.includes(line.containerType)) return name;
  return `${name} - ${quoteContainerCount(data, line.containerType)} × ${line.containerType}`;
}

/**
 * The rate offer of an FCL-priced quote: in a breakdown offer its selling lines one by one; in an
 * all-in offer one all-in rate per block (a container type, or the charges per shipment), and then
 * the charges kept out of it, each on its own line. `amountOf` is a line in the quote's currency.
 */
export function fclOfferRows(data: SalesQuoteData, lines: readonly CostLine[], amountOf: (line: CostLine) => number | null): OfferRow[] {
  if (!data.allIn) return lines.map((l) => ({ label: chargeName(l, data), amount: amountOf(l) }));
  const types = quoteTypes(data);
  const groups = new Map<string, CostLine[]>();
  for (const line of lines.filter(isInAllIn)) {
    const key = blockKeyOf(line, types);
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  const rows: OfferRow[] = [...groups].map(([key, group]) => {
    const amounts = group.map(amountOf);
    const amount = amounts.some((a) => a === null) ? null : roundCents(amounts.reduce((s: number, a) => s + a!, 0));
    const boxes = key === ALL_CONTAINERS ? quoteContainerCount(data) : quoteContainerCount(data, key);
    const what = key === PER_SHIPMENT ? (groups.size > 1 ? " - per shipment" : "") : key === ALL_CONTAINERS ? ` - ${boxes} containers` : ` - ${boxes} × ${key}`;
    return { label: `All-in rate${what}`, amount };
  });
  return [...rows, ...lines.filter((l) => !isInAllIn(l)).map((l) => ({ label: chargeName(l, data), amount: amountOf(l) }))];
}

/**
 * A Sea FCL quote's pricing in the FCL layout, from what it has: a quote priced in it already as it
 * is; a new one with no profit yet; and one whose selling was typed line by line with each charge's
 * profit as it sells it now (a sum per container, per charge), so that no price changes until
 * somebody edits it. A selling line without a buying line gets one at no cost; a buying line
 * without a selling line is not sold - its profit takes its cost away. Then its lines made from
 * that (fclLines). Null while a rate it needs is missing.
 */
export function withFclPricing(
  data: SalesQuoteData,
  sheet: ExchangeRates,
  live?: LivePricing,
  { roundUp = false }: { roundUp?: boolean } = {},
): Pick<SalesQuoteData, "buyingLines" | "sellingLines" | "fclPricing"> | null {
  const start = data.fclPricing || !(data.sellingLines ?? []).some(priceable) ? data : fromTypedSelling(data, sheet, live);
  if (!start) return null;
  // An open quote priced now has its selling rounded up to full fives; a quote shown as it was sent keeps what it had.
  const fclPricing = { ...(start.fclPricing ?? { blocks: {} }), ...(roundUp ? { roundUp: true } : {}) };
  const lines = fclLines({ ...start, fclPricing }, sheet, live);
  return lines && { ...lines, fclPricing };
}

// A value of the document with every object's keys in one order: the server stores the document
// as jsonb, which keeps keys in an order of its own, so a line read back and the same line made
// here can differ in nothing else.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([k, v]) => [k, canonical(v)]));
}

/** What FCL pricing (withFclPricing) changes of the quote: the keys whose value differs, the order of keys aside. */
export function fclChanges(fcl: Partial<SalesQuoteData>, data: SalesQuoteData): Partial<SalesQuoteData> {
  const same = (key: keyof SalesQuoteData) => JSON.stringify(canonical(fcl[key])) === JSON.stringify(canonical(data[key]));
  return Object.fromEntries(Object.entries(fcl).filter(([key]) => !same(key as keyof SalesQuoteData))) as Partial<SalesQuoteData>;
}

// A quote whose selling was typed line by line, with each charge's profit as it sells it now -
// the ROE % included: the selling line made from it is in the charge's own currency, which the ROE
// may apply to where the typed line's did not (or the other way round), so its profit makes the
// same price the typed one did.
function fromTypedSelling(data: SalesQuoteData, sheet: ExchangeRates, live?: LivePricing): SalesQuoteData | null {
  const original = data.buyingLines ?? [];
  const buyingLines = withPairIds(original);
  const selling = (data.sellingLines ?? []).filter(priceable);
  const paired = new Map<number, CostLine>();
  for (const line of selling) {
    // Paired as the lines were typed: a pair without a pairId (by its charge and text) too, so the
    // pairIds just given must not hide it.
    const i = counterpartIndex(line, original);
    if (i >= 0 && !paired.has(i)) {
      paired.set(i, line);
      continue;
    }
    // Sold without a cost: a charge bought at nothing.
    const free: CostLine = { ...line, pairId: newPairId(), supplier: "" };
    buyingLines.push(withRate(free, 0, basisUnits(data, free.basis, free.containerType)));
    paired.set(buyingLines.length - 1, line);
  }
  const quote: SalesQuoteData = { ...data, buyingLines };
  const blocks: FclPricing["blocks"] = {};
  for (const block of fclBlocks(quote)) {
    let total = 0;
    for (const index of block.lines) {
      const line = buyingLines[index]!;
      const sold = paired.get(index);
      const buyFactor = quoteCurrencyFactor(line.currency, quote, sheet);
      const sellFactor = sold ? quoteCurrencyFactor(sold.currency, quote, sheet) : 1;
      if (buyFactor === null || sellFactor === null) return null;
      const buying = ownBuying(line, block) * buyFactor;
      const sellingAt = sold ? ownBuying(sold, block) * sellFactor * sellingRoeFactor(sold.currency, quote, live) : 0;
      const profit = roundCents(sellingAt / sellingRoeFactor(line.currency, quote, live) - buying);
      total += profit;
      // Each charge keeps its profit: it takes profit in either offer.
      buyingLines[index] = { ...line, chargeProfit: { mode: "sum", value: profit }, profitBasis: profit !== 0 || isProfitBasis(line), inAllIn: true };
    }
    if (block.lines.length) blocks[block.key] = { mode: "sum", value: roundCents(total), perCharge: true };
  }
  return { ...quote, fclPricing: { blocks } };
}
