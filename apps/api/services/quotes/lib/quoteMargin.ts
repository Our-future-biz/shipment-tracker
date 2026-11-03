// The margin of a sales quote of any freight mode: what it sells for minus what it buys for, worked
// out the way the quote editor works out its totals (web sales/_lib/salesQuote.ts computeTotals),
// so the rep, the manager and the gate read one number (Council Outlay 6, owner decision D4,
// 3 Nov 2026). Each line is converted to the quote's currency and rounded to cents on its own; a
// selling line in another currency also carries the company ROE %; the totals are then given in
// CZK too. Pure and free of imports - the web tests run the editor against it - and the document
// comes from browsers, so nothing about its shape is taken for granted.

/** What a margin is worked out with: today's ČNB sheet (CZK per unit; null = none) and the company ROE %. */
export interface QuoteRates {
  /** The business day the rates are for. */
  today: string;
  rates: Record<string, number | null>;
  /** The ROE % a draft's selling lines in another currency carry (100 = pure ČNB). */
  roePct: number;
  /** Today's sheet could not be loaded at all: a missing rate then says so rather than "no rate". */
  unavailable?: boolean;
}

export interface QuoteMargin {
  /** The quote's currency; selling, buying and profit are in it. */
  currency: string;
  selling: number;
  buying: number;
  profit: number;
  sellingCzk: number;
  buyingCzk: number;
  /** null when a rate it needs is missing (see problem), or the quote has no lines yet. */
  marginCzk: number | null;
  /** Profit in percent of selling, to one decimal as the editor shows it; null when marginCzk is, or nothing is sold. */
  marginPercent: number | null;
  /** Why the margin cannot be worked out, e.g. "No ČNB rate for EUR on 2026-10-15". */
  problem: string | null;
  /** No selling and no buying lines: nothing to judge. */
  empty: boolean;
}

// Statuses before the quote goes to the customer: priced at today's rates (web FX_DRAFT_STATUSES).
const UNSENT_STATUSES = new Set(["draft", "ready_to_send", "revised"]);

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const roundCents = (value: number) => Math.round(value * 100) / 100;

export function linesOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/**
 * A line's value: its amount - what the editor shows and a user may change by hand; qty × unit
 * price only when the line has no amount. Trucking prices a consignment from a quote by the same rule.
 */
export function lineAmount(line: Record<string, unknown>): number {
  const amount = isNumber(line.amount) ? line.amount : typeof line.amount === "string" && line.amount.trim() !== "" ? Number(line.amount) : NaN;
  if (Number.isFinite(amount)) return amount;
  if (isNumber(line.qty) && isNumber(line.unitPrice)) return line.qty * line.unitPrice;
  return 0;
}

// A quote whose currency was never changed stores none and is in EUR.
function quoteCurrency(data: Record<string, unknown>): string {
  return typeof data.currency === "string" && data.currency ? data.currency : "EUR";
}

// CZK per 1 unit of `currency` for this quote, as the editor takes it: a sent quote's stored rate
// (data.fx); else on a draft today's, its own typed rate (data.rates) only filling a currency the
// sheet lacks, and on an older sent quote its own rate before today's. Null when none is known.
function rateOf(currency: string, data: Record<string, unknown>, ctx: QuoteRates): number | null {
  if (currency === "CZK") return 1;
  const stored = isObject(data.fx) && isObject(data.fx.rates) ? data.fx.rates[currency] : undefined;
  const ownEntry = isObject(data.rates) ? data.rates[currency] : undefined;
  const own = isObject(ownEntry) ? ownEntry.rate : undefined;
  const today = ctx.rates[currency];
  const status = typeof data.quoteStatus === "string" && data.quoteStatus ? data.quoteStatus : "draft";
  const draft = UNSENT_STATUSES.has(status);
  const rate = isNumber(stored) ? stored : draft ? (isNumber(today) ? today : own) : isNumber(own) ? own : today;
  return isNumber(rate) && rate > 0 ? rate : null;
}

// The ROE % of the quote: the one stored with a sent quote's rates, today's on a draft.
function roeOf(data: Record<string, unknown>, ctx: QuoteRates): number {
  return isObject(data.fx) && isNumber(data.fx.roePct) ? data.fx.roePct : ctx.roePct;
}

/** The margin of a quote; null when it is no document. */
export function quoteMargin(data: unknown, ctx: QuoteRates): QuoteMargin | null {
  if (!isObject(data)) return null;
  const to = quoteCurrency(data);
  const roe = roeOf(data, ctx) / 100;
  const missing = new Set<string>();
  const sum = (lines: Record<string, unknown>[], selling: boolean) => {
    let total = 0;
    for (const line of lines) {
      const from = typeof line.currency === "string" && line.currency ? line.currency : to;
      const amount = lineAmount(line);
      if (from === to) {
        total += roundCents(amount);
        continue;
      }
      const fromRate = rateOf(from, data, ctx);
      const toRate = rateOf(to, data, ctx);
      if (fromRate === null || toRate === null) {
        // Left out of the total, as the editor leaves it out; the rate to enter is the one it lacks.
        if (fromRate === null) missing.add(from);
        if (toRate === null) missing.add(to);
        continue;
      }
      total += roundCents(((amount * fromRate) / toRate) * (selling ? roe : 1));
    }
    return roundCents(total);
  };
  const sellingLines = linesOf(data.sellingLines);
  const buyingLines = linesOf(data.buyingLines);
  const selling = sum(sellingLines, true);
  const buying = sum(buyingLines, false);
  const profit = roundCents(selling - buying);
  const czk = rateOf(to, data, ctx);
  if (czk === null) missing.add(to);
  const inCzk = (amount: number) => (czk === null ? 0 : roundCents(amount * czk));
  const needed = [...missing].sort();
  const problem = !needed.length
    ? null
    : ctx.unavailable
      ? `Today's ČNB rates could not be loaded (${needed.join(", ")} needed) - try again in a moment`
      : needed.map((c) => `No ČNB rate for ${c} on ${ctx.today}`).join("; ");
  const empty = !sellingLines.length && !buyingLines.length;
  const marginCzk = problem || empty ? null : inCzk(profit);
  return {
    currency: to,
    selling,
    buying,
    profit,
    sellingCzk: inCzk(selling),
    buyingCzk: inCzk(buying),
    marginCzk,
    marginPercent: marginCzk !== null && selling !== 0 ? Math.round((profit / selling) * 1000) / 10 : null,
    problem,
    empty,
  };
}
