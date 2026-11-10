import { containerType } from "@/lib/cargo";
import { toChargeCode } from "@/lib/chargeCodes";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { roundCents } from "@/lib/money";
import { counterpartIndex, newPairId } from "./costPairs";
import { isTruckingLine } from "./roadQuote";
import { basisUnits, convertLine, isContainerQuote, lineRate, perUnitBasis, quoteContainerCount, quoteCurrencyFactor, sellingRoeFactor, withRate, type LivePricing } from "./salesQuote";
import type { CostLine, FclBlockProfit, FclPricing, FclProfit, SalesQuoteData } from "./types";

// FCL pricing: how a Sea FCL quote is priced (the Pricing step's FCL layout). The buying lines are
// the charges, in blocks: one per container type, priced per container, and one for the charges per
// shipment (B/L fee and the like). Each charge has its own profit ("Edit per charge") - a % of its
// selling price or a sum in the quote's currency, per container in a container block. The charges
// ticked "All in" add up to the all-in price the customer is offered; the others stay on their own
// lines.
//
// A quote sent before that (no fclPricing.byCharge) keeps what it had: a profit per block put on its
// charges pro rata to their buying, on those in the all-in price of an all-in offer (the others at
// cost) or those ticked as profit basis of a breakdown offer. An open quote is brought over once, as
// it is priced (toByCharge), with the same prices and the same offer.
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
// How far off the full five a block's lines can come from their own rounding alone.
const MAX_ROUNDING_LEFT = 1;

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

// The container type a line charged per container but saved without one is for: the quote's only
// type, or the only one its tariff priced it for. "" when that can't be told.
function ownContainerType(line: CostLine, types: readonly string[]): string {
  if (line.basis !== "container" || line.containerType || !priceable(line)) return "";
  if (types.length === 1) return types[0]!;
  const priced = (line.pricedFor ?? "").split(", ").map((box) => /^(.+) \d+(?:\.\d+)? kg$/.exec(box)?.[1]);
  return priced.length === 1 && priced[0] && types.includes(priced[0]) ? priced[0] : "";
}

/**
 * A rate per container is the rate of one size: the lines saved without their container type get
 * it, so they stay in that type's block when another type is added to the cargo, and count only
 * its containers. Null when no line needs it.
 */
export function withContainerTypes(data: SalesQuoteData): Pick<SalesQuoteData, "buyingLines" | "sellingLines"> | null {
  if (!isContainerQuote(data)) return null;
  const types = quoteTypes(data);
  let changed = false;
  const typed = (lines: CostLine[] | undefined) =>
    lines?.map((line) => {
      const type = ownContainerType(line, types);
      if (!type) return line;
      changed = true;
      return { ...line, containerType: type };
    });
  const result = { buyingLines: typed(data.buyingLines), sellingLines: typed(data.sellingLines) };
  return changed ? result : null;
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
  /** The buying line that took the rounding up to full fives; null when the block is not rounded. */
  roundedOn: number | null;
  /** What that rounding added to its selling, as more profit; 0 when it added nothing. */
  roundedUpBy: number;
}

const zeroProfit: FclProfit = { mode: "sum", value: 0 };

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
  const byCharge = !!data.fclPricing?.byCharge;
  const charges: FclChargePrice[] = block.lines.map((index) => {
    const line = lines[index]!;
    const factor = quoteCurrencyFactor(line.currency, data, sheet);
    return { index, takesProfit: byCharge || takesProfit(line, allIn), buying: factor === null ? null : roundCents(ownBuying(line, block) * factor), profit: 0, roe: 0, selling: null, percent: null };
  });
  const taking = charges.filter((c) => c.takesProfit && c.buying !== null);
  if (byCharge || setting.perCharge) {
    for (const c of taking) {
      const own: FclProfit = lines[c.index]!.chargeProfit ?? (byCharge ? zeroProfit : { mode: setting.mode, value: setting.mode === "percent" ? setting.value : 0 });
      c.profit = own.mode === "sum" ? roundCents(Number(own.value) || 0) : percentProfit(c.buying!, Number(own.value) || 0);
    }
  } else {
    const buying = taking.reduce((sum, c) => sum + c.buying!, 0);
    const profit = setting.mode === "sum" ? roundCents(Number(setting.value) || 0) : percentProfit(buying, Number(setting.value) || 0);
    allocate(profit, taking, lines);
  }
  for (const c of charges) if (c.buying !== null) sell(c, lines[c.index]!, data, live);
  const sum = (pick: (c: FclChargePrice) => number | null) => roundCents(charges.reduce((s, c) => s + (pick(c) ?? 0), 0));
  const sellingAsEntered = sum((c) => c.selling);
  // No profit yet is no reason to round: a block goes to the full five only once it has one.
  const blockSetsProfit = byCharge ? taking.some((c) => c.profit !== 0) : setting.perCharge || (Number(setting.value) || 0) !== 0;
  const roundedOn = data.fclPricing?.roundUp && blockSetsProfit ? roundSellingUp(charges, taking, lines, data, live) : null;
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
    roundedOn,
    roundedUpBy: roundCents(selling - sellingAsEntered),
  };
}

/**
 * Why a Sea FCL quote can't go out: a container type it offers without a profit. What counts is the
 * profit of the type's block, with what the charges per container of every type add to each; the
 * charges per shipment and the trucking lines are not on a container, and the ROE % is no profit.
 * Twin of apps/api/services/quotes/utils/fclProfit.utils.ts, which refuses it.
 */
export function fclProfitBlock(data: SalesQuoteData, sheet: ExchangeRates, live?: LivePricing): string | null {
  if (!isContainerQuote(data)) return null;
  const blocks = fclBlocks(data);
  const everyType = blocks.find((b) => b.key === ALL_CONTAINERS);
  const onEvery = everyType ? priceFclBlock(data, sheet, everyType, live).profit : 0;
  const without = blocks
    .filter((b) => b.perContainer && b.key !== ALL_CONTAINERS && b.units > 0)
    // In whole cents, as the server counts it: a cent of profit is a profit.
    .filter((b) => Math.round((priceFclBlock(data, sheet, b, live).profit + onEvery) * 100) <= 0)
    .map((b) => b.label);
  return without.length ? `No profit on ${without.join(", ")} yet — every container type needs a profit in Pricing before the quote goes out` : null;
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
function roundSellingUp(charges: FclChargePrice[], taking: FclChargePrice[], lines: readonly CostLine[], data: SalesQuoteData, live?: LivePricing): number | null {
  if (!taking.length) return null;
  const total = () => roundCents(charges.reduce((s, c) => s + (c.selling ?? 0), 0));
  // In whole cents, so 6,275.01 goes to 6,280 and 6,275.00 stays.
  const target = (Math.ceil(Math.round(total() * 100) / (SELLING_ROUNDS_TO * 100)) * SELLING_ROUNDS_TO);
  const inQuoteCurrency = taking.filter((c) => sellingRoeFactor(lines[c.index]!.currency, data, live) === 1);
  const pool = inQuoteCurrency.length ? inQuoteCurrency : taking;
  const anchor = pool.find((c) => codeOf(lines[c.index]!) === "ocean_freight") ?? pool.reduce((best, c) => (c.buying! > best.buying! ? c : best), pool[0]!);
  if (total() >= target) return anchor.index;
  const line = lines[anchor.index]!;
  anchor.profit = roundCents(anchor.profit + (target - total()) / sellingRoeFactor(line.currency, data, live));
  sell(anchor, line, data, live);
  for (let cents = 0; total() < target && cents < 100; cents++) {
    anchor.profit = roundCents(anchor.profit + 0.01);
    sell(anchor, line, data, live);
  }
  // A step of the ROE % can pass the full five by a cent: the five is what the block sells for.
  if (total() > target) anchor.selling = roundCents(anchor.selling! - (total() - target));
  return anchor.index;
}

// Each selling line is rounded to the cents of its own currency and then converted, so a block whose
// card comes to a full five can reach the totals a cent or more off it. The line the rounding went
// to takes up the difference, in as many decimals as that needs: only its amount changes.
function settleRounding(priced: FclBlockPrice, block: FclBlock, selling: Map<number, CostLine>, quote: SalesQuoteData, sheet: ExchangeRates, live?: LivePricing) {
  const anchor = priced.roundedOn === null ? undefined : selling.get(priced.roundedOn);
  if (!anchor) return;
  const sold = priced.charges.flatMap((c) => (selling.has(c.index) ? [selling.get(c.index)!] : []));
  const converted = sold.map((l) => convertLine(l, quote, sheet, { selling: true, live }));
  const factor = quoteCurrencyFactor(anchor.currency, quote, sheet);
  if (factor === null || converted.some((v) => v === null)) return;
  const units = block.perContainer ? basisUnits(quote, anchor.basis, anchor.containerType) : 1;
  const difference = roundCents(priced.selling * units - converted.reduce<number>((sum, v) => sum + v!, 0));
  // Only what rounding left: anything more is a real difference, not for this to hide.
  if (difference === 0 || Math.abs(difference) > MAX_ROUNDING_LEFT) return;
  const own = convertLine(anchor, quote, sheet, { selling: true, live })! + difference;
  selling.set(priced.roundedOn!, { ...anchor, amount: Math.round((own / (factor * sellingRoeFactor(anchor.currency, quote, live))) * 1e6) / 1e6 });
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
    settleRounding(priced, block, selling, quote, sheet, live);
  }
  const trucking = (data.sellingLines ?? []).filter(isTruckingLine);
  return { buyingLines, sellingLines: [...buyingLines.flatMap((_, i) => (selling.has(i) ? [selling.get(i)!] : [])), ...trucking] };
}

/** One row of the rate offer on the customer's quotation. */
export interface OfferRow {
  label: string;
  amount: number | null;
}

/** One section of the rate offer: a container type, or the charges per shipment, as in Pricing. */
export interface OfferGroup {
  /** "20' DC · 2 containers", "All containers", "Per shipment". */
  label: string;
  rows: OfferRow[];
}

// A charge's name for the customer. Its section says the containers, so a tariff line's own
// "- 2 × 20' DC" (from when it was priced, however many there are now) is left off.
function chargeName(line: CostLine): string {
  const name = line.description?.trim() || line.type;
  return line.basis === "container" && line.containerType ? name.replace(new RegExp(` - \\d+ × ${escapeRegExp(line.containerType)}$`), "") : name;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function offerGroupLabel(key: string, data: SalesQuoteData): string {
  if (key === PER_SHIPMENT) return "Per shipment";
  if (key === ALL_CONTAINERS) return "All containers";
  const boxes = quoteContainerCount(data, key);
  return `${key} · ${boxes} ${boxes === 1 ? "container" : "containers"}`;
}

/**
 * The rate offer of an FCL-priced quote, in the sections of its Pricing: the container types in the
 * order of the cargo, then the charges per shipment. In each, the charges in the all-in price are
 * one all-in rate, and the others follow on their own lines; a quote sent as a breakdown has every
 * charge on its own line. `amountOf` is a line in the quote's currency.
 */
export function fclOfferGroups(data: SalesQuoteData, lines: readonly CostLine[], amountOf: (line: CostLine) => number | null): OfferGroup[] {
  const types = quoteTypes(data);
  const blocks = new Map<string, CostLine[]>();
  for (const line of lines) {
    const key = blockKeyOf(line, types);
    blocks.set(key, [...(blocks.get(key) ?? []), line]);
  }
  const others = [...blocks.keys()].filter((key) => key !== PER_SHIPMENT && !types.includes(key));
  return [...types, ...others, PER_SHIPMENT].flatMap((key) => {
    const block = blocks.get(key);
    if (!block) return [];
    const inAllIn = data.allIn ? block.filter(isInAllIn) : [];
    const amounts = inAllIn.map(amountOf);
    const allInRow: OfferRow[] = inAllIn.length ? [{ label: "All-in rate", amount: amounts.some((a) => a === null) ? null : roundCents(amounts.reduce((s: number, a) => s + a!, 0)) }] : [];
    const rest = block.filter((l) => !inAllIn.includes(l)).map((l) => ({ label: chargeName(l), amount: amountOf(l) }));
    return [{ label: offerGroupLabel(key, data), rows: [...allInRow, ...rest] }];
  });
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
  { roundUp = false, open = false }: { roundUp?: boolean; open?: boolean } = {},
): (Pick<SalesQuoteData, "buyingLines" | "sellingLines" | "fclPricing"> & { allIn?: boolean }) | null {
  const typed = data.fclPricing || !(data.sellingLines ?? []).some(priceable) ? data : fromTypedSelling(data, sheet, live);
  if (!typed) return null;
  // An open quote has a profit per charge and its "All in" ticks; a quote shown as it was sent keeps what it had.
  const start = open ? toByCharge(typed, sheet, live) : typed;
  if (!start) return null;
  // An open quote priced now has its selling rounded up to full fives; a quote shown as it was sent keeps what it had.
  const fclPricing = { ...(start.fclPricing ?? { blocks: {} }), ...(roundUp ? { roundUp: true } : {}) };
  const lines = fclLines({ ...start, fclPricing }, sheet, live);
  return lines && { ...lines, fclPricing, ...(open ? { allIn: true } : {}) };
}

// An open quote from before each charge had its own profit, brought over with the same prices and
// the same offer: each charge keeps the profit it has now, and in what was a breakdown offer no
// charge is in the all-in price, so each stays on its own line. A new quote just starts so. Null
// while a rate it needs is missing: the profit on a charge could not be told.
function toByCharge(data: SalesQuoteData, sheet: ExchangeRates, live?: LivePricing): SalesQuoteData | null {
  if (data.fclPricing?.byCharge) return data;
  if (!data.fclPricing) return { ...data, fclPricing: { blocks: {}, byCharge: true } };
  const offer = (line: CostLine): CostLine => (data.allIn ? line : { ...line, inAllIn: false });
  const buyingLines = (data.buyingLines ?? []).map(offer);
  const blocks: FclPricing["blocks"] = {};
  for (const block of fclBlocks(data)) {
    const setting = blockProfitOf(data, block.key);
    const priced = priceFclBlock(data, sheet, block, live);
    for (const c of priced.charges) {
      if (c.buying === null) return null;
      const line = buyingLines[c.index]!;
      buyingLines[c.index] = { ...line, chargeProfit: chargeProfitNow(c, line, setting) };
    }
    if (block.lines.length) blocks[block.key] = { mode: "sum", value: priced.profit, perCharge: true };
  }
  return { ...data, buyingLines, sellingLines: (data.sellingLines ?? []).map(offer), fclPricing: { ...data.fclPricing, blocks, byCharge: true } };
}

// The profit a charge has now, as its own: a charge offered at cost none, one the block's % applied to that %.
function chargeProfitNow(c: FclChargePrice, line: CostLine, setting: FclBlockProfit): FclProfit {
  if (!c.takesProfit) return zeroProfit;
  if (setting.perCharge && line.chargeProfit) return line.chargeProfit;
  return !setting.perCharge && setting.mode === "percent" ? { mode: "percent", value: setting.value } : { mode: "sum", value: c.profit };
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
