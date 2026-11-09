import { containerType } from "../../../lib/containerTares";
import { TRUCKING_REF_PREFIX } from "../lib/roadMargin";
import { lineAmount, linesOf, rateOf, type QuoteRates } from "../lib/quoteMargin";
import { isPlainObject } from "./quoteDocument.utils";

// A Sea FCL quote goes out only with a profit on every container type it offers: the block of that
// type on the Pricing step (web sales/_lib/fclPricing.ts fclProfitBlock is its twin). What counts
// is a type's own charges per container, with those charged per container of every type; the
// charges per shipment and the trucking lines are not on a container, and the ROE % is no profit.

const ALL_CONTAINERS = "*";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
// A profit is counted in whole cents: 1,005.00 less 1,004.99 is one cent (the float says
// 0.0099…), while the half cent a selling rate rounded to cents leaves over a buying rate with more
// decimals is none. Worked out to the millionth first, so the float's last digits drop away.
const wholeCents = (amount: number) => Math.trunc(Math.round(amount * 1_000_000) / 10_000);

// The types of its container lines, in their order.
function quoteTypes(data: Record<string, unknown>): string[] {
  const types = linesOf(data.containers).flatMap((c) => (Number(c.qty) > 0 && containerType(text(c.type)) ? [containerType(text(c.type))] : []));
  return [...new Set(types)];
}

// A line's price per container, as the Pricing step counts it.
const perContainer = (line: Record<string, unknown>) => Number(line.unitPrice ?? lineAmount(line)) || 0;

// Selling less buying per container of each block, currency by currency.
function profitsByBlock(data: Record<string, unknown>, types: readonly string[]): Map<string, Map<string, number>> {
  const blocks = new Map<string, Map<string, number>>();
  const quoteCurrency = text(data.currency) || "EUR";
  const add = (lines: unknown, sign: 1 | -1) => {
    for (const line of linesOf(lines)) {
      if (line.basis !== "container" || text(line.tariffRef).startsWith(TRUCKING_REF_PREFIX)) continue;
      const key = containerType(text(line.containerType)) || (types.length === 1 ? types[0]! : ALL_CONTAINERS);
      const block = blocks.get(key) ?? new Map<string, number>();
      const currency = text(line.currency) || quoteCurrency;
      block.set(currency, (block.get(currency) ?? 0) + sign * perContainer(line));
      blocks.set(key, block);
    }
  };
  add(data.sellingLines, 1);
  add(data.buyingLines, -1);
  return blocks;
}

// The whole cents of a type's block and of the block of every type, currency by currency.
function merged(...blocks: (Map<string, number> | undefined)[]): [string, number][] {
  const sums = new Map<string, number>();
  for (const block of blocks) for (const [currency, value] of block ?? []) sums.set(currency, (sums.get(currency) ?? 0) + value);
  return [...sums].map(([currency, value]) => [currency, wholeCents(value)]);
}

// In one currency, or all with the same sign, it needs no rate. Only a profit in one currency
// against a loss in another is worked out; a currency without a rate counts for nothing then.
function hasProfit(parts: [string, number][], data: Record<string, unknown>, rates: QuoteRates | undefined): boolean {
  const real = parts.filter(([, cents]) => cents !== 0);
  if (!real.length || real.every(([, cents]) => cents < 0)) return false;
  if (real.every(([, cents]) => cents > 0)) return true;
  if (!rates) return false;
  return real.reduce((sum, [currency, cents]) => sum + cents * (rateOf(currency, data, rates) ?? 0), 0) > 0;
}

/** Why the quote can't go out for a container type without a profit; null when it may, or is no Sea FCL quote. */
export function fclProfitGateMessage(data: unknown, rates?: QuoteRates): string | null {
  if (!isPlainObject(data) || data.serviceType !== "Sea FCL") return null;
  const types = quoteTypes(data);
  const blocks = profitsByBlock(data, types);
  const without = types.filter((type) => !hasProfit(merged(blocks.get(type), blocks.get(ALL_CONTAINERS)), data, rates));
  return without.length ? noProfitMessage(without) : null;
}

function noProfitMessage(types: readonly string[]): string {
  return `No profit on ${types.join(", ")} yet — every container type needs a profit in Pricing before the quote goes out`;
}
