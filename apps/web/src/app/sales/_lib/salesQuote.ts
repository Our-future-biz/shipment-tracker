import dayjs from "dayjs";
import type { interfaces } from "@/lib/api/client";
import { downloadCsv } from "@/lib/csv";
import type { ExchangeRates, WeekRates } from "@/lib/exchangeRates";
import { fmtMoney, roundCents } from "@/lib/money";
import type { SalesQuoteData, CostLine, PackageLine, QuoteRate, TimelineEntry } from "./types";
import { PROTECTED_KEYS } from "./types";

// A sales quote as the lists, reports and pickers work with it: its document, and next to it what
// the server keeps and works out about the quote. Those facts are read from here and not from the
// document's own copies of them (data.quoteStatus, data.validUntil, data.salesOwner): the copies
// cannot say "expired" and know the owner only as text.
export interface SalesQuote {
  quoteNumber: string;
  createdAt: string;
  updatedAt: string;
  data: SalesQuoteData;
  /** The status to show: "expired" for a Quoted or Feedback quote whose validity has passed. */
  status: string;
  /** The status as stored - what an expired quote still is underneath. */
  storedStatus: string;
  ownerUserId: string | null;
  /** The owner's current name; the text an old quote has instead when no user is linked. Empty without an owner. */
  ownerName: string;
  /** The last sending. */
  sentAt: string | null;
  /** The last day the quote is valid (YYYY-MM-DD). */
  validUntil: string | null;
  /** When the customer last heard from us: the last recorded contact, else the last sending. */
  lastContactAt: string | null;
  /** The customer should be contacted again - the server's rule, judged when the quote was read. */
  followUpDue: boolean;
  /** The statuses the quote may be set to now. */
  allowedTransitions: string[];
  /** The shipment the quote is linked to: the oldest live one that carries it as its Sales Number. */
  shipmentId: string | null;
  /** That shipment's job number. */
  shipmentJobNumber: string | null;
}

export function asData(d: unknown): SalesQuoteData {
  return d && typeof d === "object" ? (d as SalesQuoteData) : {};
}

export function toSalesQuote(item: interfaces.SalesQuoteItem): SalesQuote {
  return {
    quoteNumber: item.quoteNumber,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    data: asData(item.data),
    status: item.effectiveStatus,
    storedStatus: item.status,
    ownerUserId: item.ownerUserId,
    ownerName: item.ownerName,
    sentAt: item.sentAt,
    validUntil: item.validUntil,
    lastContactAt: item.lastContactAt,
    followUpDue: item.followUpDue,
    allowedTransitions: item.allowedTransitions,
    shipmentId: item.shipmentId,
    shipmentJobNumber: item.shipmentJobNumber,
  };
}

// What an edit may change of a quote: the patch without the keys only the server writes. Status,
// validity, owner and history have their own actions, so whatever brings such a key along - a
// copied quote, an imported inquiry - does not get it into the document.
export function stripProtected(patch: Partial<SalesQuoteData>): Partial<SalesQuoteData> {
  const own = { ...patch };
  for (const key of PROTECTED_KEYS) delete own[key];
  return own;
}

// The lines of a quote's history that record a change of status, oldest first. A line without a
// kind was written before kinds existed and is one of them. Only a line that names a status
// counts, as on the server (applyShipmentLinks in apps/api/services/quotes/utils/quoteLifecycle.utils.ts).
export function statusLines(data: SalesQuoteData): TimelineEntry[] {
  const { timeline } = data;
  if (!Array.isArray(timeline)) return [];
  return timeline.filter((entry) => entry && typeof entry === "object" && (!entry.kind || entry.kind === "status") && typeof entry.status === "string");
}

// The reference of a sales quote - QCZ, the day, that day's number and for a variant -2, -3, ... -
// as the server gives them out (SALES_REFERENCE_PATTERN in apps/api/lib/salesReference.ts).
const SALES_QUOTE_REF = /^QCZ[0-9]{8}[0-9]{3,}(-[0-9]+)?$/;

/** Whether a text is the reference of a sales quote, and not a number of the old quotes module or anything else. */
export function isSalesQuoteRef(ref: string): boolean {
  return SALES_QUOTE_REF.test(ref);
}

// Duplicates branch off their base reference as QCZ…-2, -3, …; together they
// form a "family" of variants (e.g. an AIR and a SEA option for one enquiry).
export function baseRef(ref: string): string {
  return ref.replace(/-\d+$/, "");
}

export function quoteFamily(quotes: SalesQuote[], ref: string): SalesQuote[] {
  const base = baseRef(ref);
  const suffix = (q: SalesQuote) =>
    q.quoteNumber === base ? 1 : parseInt(q.quoteNumber.slice(base.length + 1), 10) || 1;
  return quotes
    .filter((q) => baseRef(q.quoteNumber) === base)
    .sort((a, b) => suffix(a) - suffix(b));
}

// Newest first, the order quotes are listed in; the reference settles it for two quotes created
// in the same instant. For lists that come from the server in no order (useAllSalesQuotes).
export function newestFirst(a: SalesQuote, b: SalesQuote): number {
  return b.createdAt.localeCompare(a.createdAt) || b.quoteNumber.localeCompare(a.quoteNumber);
}

// Freight cargo metrics. With package lines they are the lines added up. A quote without any has
// only the one weight and volume stored for the whole shipment - what an inquiry import read - and
// those count then: the printed quotation and the New Shipment wizard go by them, and a figure
// that reaches the customer has to show on the screens first. Volumetric weight uses the standard
// air divisor of 6000 (cm³ → kg); chargeable weight is max(gross, volumetric).
export function computeCargo(data: SalesQuoteData) {
  const pkgs = data.packages ?? [];
  const n = (v: unknown) => Number(v) || 0;
  const fromLines = pkgs.length > 0;
  const totalPackages = pkgs.reduce((s, p) => s + n(p.qty), 0);
  const grossWeight = fromLines ? pkgs.reduce((s, p) => s + n(p.qty) * n(p.weight), 0) : n(data.weight);
  const cbm = fromLines ? pkgs.reduce((s, p) => s + (n(p.qty) * n(p.length) * n(p.width) * n(p.height)) / 1_000_000, 0) : n(data.cbm);
  const volumetricWeight = fromLines
    ? pkgs.reduce((s, p) => s + (n(p.qty) * n(p.length) * n(p.width) * n(p.height)) / 6000, 0)
    : (n(data.cbm) * 1_000_000) / 6000;
  return {
    totalPackages,
    grossWeight: Math.round(grossWeight * 100) / 100,
    cbm: Math.round(cbm * 1000) / 1000,
    volumetricWeight: Math.round(volumetricWeight * 100) / 100,
    chargeableWeight: Math.round(Math.max(grossWeight, volumetricWeight) * 100) / 100,
  };
}

// The day the cargo is ready (YYYY-MM-DD), when the quote stores one; empty otherwise. The field
// can also hold what an inquiry said in words ("15 March", "ASAP" - an earlier import left such
// texts), which is no date to show, to sort a file by or to print: read as one it would come out
// as some day of another year. The quote page, the lists and the customer's document all go by
// this, so the document never states a readiness that no screen shows.
export function cargoReadyDay(data: SalesQuoteData): string {
  const ready = data.readyDate ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(ready) ? ready : "";
}

// A package's dimensions as documents print them, "120×80×100". A dimension nobody entered is a
// dash; a package without any has nothing to print.
export function fmtDimensions(p: PackageLine): string {
  const dimensions = [p.length, p.width, p.height];
  return dimensions.some(Boolean) ? dimensions.map((d) => d || "—").join("×") : "";
}

// ── Money ──
// Every cost line keeps its own currency; the quote is presented in one (quoteCurrency) and its
// totals are the lines converted into it. Rates are CZK per 1 unit and conversions go through CZK,
// as in the shipment costs. `sheet` in the functions below is the current Exchange sheet
// (useCurrentExchangeRates).

// A quote whose currency was never changed stores none and is in EUR.
export function quoteCurrency(data: SalesQuoteData): string {
  return data.currency || "EUR";
}

// CZK per 1 unit of `currency` for this quote. The rate the quote stores wins, so a quote that was
// sent keeps its numbers when next week's sheet is entered; a quote that stores none - every quote
// from before rates existed - follows the sheet. Null when neither knows the currency: it is then
// left out, never converted at 1.
function rateOf(currency: string, data: SalesQuoteData, sheet: ExchangeRates): number | null {
  if (currency === "CZK") return 1;
  const rate = data.rates?.[currency]?.rate ?? sheet[currency];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}

// One cost line in the quote's currency, rounded to cents on its own, so the lines a screen shows
// add up to exactly the total it shows. Null when a rate it needs is missing.
export function convertLine(line: CostLine, data: SalesQuoteData, sheet: ExchangeRates): number | null {
  const to = quoteCurrency(data);
  const from = line.currency || to;
  const amount = Number(line.amount) || 0;
  if (from === to) return roundCents(amount);
  const fromRate = rateOf(from, data, sheet);
  const toRate = rateOf(to, data, sheet);
  return fromRate === null || toRate === null ? null : roundCents((amount * fromRate) / toRate);
}

function sumLines(lines: CostLine[] | undefined, data: SalesQuoteData, sheet: ExchangeRates) {
  const to = quoteCurrency(data);
  const missingRates = new Set<string>();
  let total = 0;
  for (const line of lines ?? []) {
    const converted = convertLine(line, data, sheet);
    if (converted !== null) {
      total += converted;
      continue;
    }
    // Left out of the total. The rate to enter is the one the conversion lacks: the line's, the
    // quote's, or both.
    for (const currency of [line.currency, to]) {
      if (rateOf(currency, data, sheet) === null) missingRates.add(currency);
    }
  }
  return { total: roundCents(total), missingRates: [...missingRates].sort() };
}

export interface QuoteTotals {
  /** The quote's currency; every amount below is in it. */
  currency: string;
  selling: number;
  buying: number;
  profit: number;
  /** Profit in percent of selling, to one decimal. Null when there is no selling to relate it to. */
  margin: number | null;
  /** Currencies that could not be converted, sorted: no rate is known for them, and the lines that need one are not in the amounts above. */
  missingRates: string[];
  /** Those of them that keep a selling line out - the total a customer would be shown is then incomplete. */
  missingSellingRates: string[];
  /** Those of them that keep a buying line out. */
  missingBuyingRates: string[];
}

export function computeTotals(data: SalesQuoteData, sheet: ExchangeRates): QuoteTotals {
  const selling = sumLines(data.sellingLines, data, sheet);
  const buying = sumLines(data.buyingLines, data, sheet);
  const profit = roundCents(selling.total - buying.total);
  return {
    currency: quoteCurrency(data),
    selling: selling.total,
    buying: buying.total,
    profit,
    margin: selling.total ? Math.round((profit / selling.total) * 1000) / 10 : null,
    missingRates: [...new Set([...selling.missingRates, ...buying.missingRates])].sort(),
    missingSellingRates: selling.missingRates,
    missingBuyingRates: buying.missingRates,
  };
}

// The currencies whose rate the quote's totals depend on. A line in another currency than the
// quote's is converted through CZK, which takes the rate of both; CZK is the base and needs none.
export function ratesNeeded(data: SalesQuoteData): string[] {
  const to = quoteCurrency(data);
  const needed = new Set<string>();
  for (const line of [...(data.sellingLines ?? []), ...(data.buyingLines ?? [])]) {
    const from = line.currency || to;
    if (from !== to) needed.add(from).add(to);
  }
  needed.delete("CZK");
  return [...needed].sort();
}

// The quote's rates after taking the Exchange sheet's for the currencies it converts: only where it
// has none yet, or - `replaceStored` - over the ones it has as well. A currency the sheet does not
// carry (GBP, CHF) is left as it is.
export function ratesFromSheet(
  data: SalesQuoteData,
  exchange: Pick<WeekRates, "rates" | "usedWeek">,
  replaceStored = false,
): Record<string, QuoteRate> | undefined {
  const taken: Record<string, QuoteRate> = {};
  for (const currency of ratesNeeded(data)) {
    const rate = exchange.rates[currency];
    if (rate !== undefined && (replaceStored || !data.rates?.[currency])) taken[currency] = { rate, week: exchange.usedWeek };
  }
  return Object.keys(taken).length ? { ...data.rates, ...taken } : data.rates;
}

// Why the customer's document must not be printed or sent, or null when it may be: a total that
// leaves selling lines out would offer the customer a wrong price. `sheetFailed`: the Exchange
// sheet could not be read, so the rates are not known to be missing and nobody is told to type one.
export function documentBlock(totals: QuoteTotals, sheetFailed: boolean): string | null {
  if (!totals.missingSellingRates.length) return null;
  if (sheetFailed) {
    return "The exchange rates could not be loaded, so the total for the customer cannot be worked out. Try again in a moment.";
  }
  return `No exchange rate for ${totals.missingSellingRates.join(", ")}, so the total for the customer cannot be worked out. Enter the rate in the quote's Pricing section first.`;
}

export type CurrencyAmount = [currency: string, amount: number];

// Amounts of several quotes are summed per currency and never across: "12,000 EUR · 3,000 USD",
// sorted by currency. Empty when there is nothing to add up.
export function fmtByCurrency(amounts: CurrencyAmount[]): string {
  const sums = new Map<string, number>();
  for (const [currency, amount] of amounts) sums.set(currency, (sums.get(currency) ?? 0) + amount);
  return [...sums]
    .filter(([, sum]) => roundCents(sum) !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, sum]) => fmtMoney(sum, currency))
    .join(" · ");
}

// The selling of several quotes added up per currency, and whether the sum is short: a quote with
// selling lines that have no exchange rate adds only what could be converted. Such a sum is marked
// wherever it is shown, as the quote's own figure is - a partial sum must not pass for the whole.
export function sellingSum(totals: QuoteTotals[]): { text: string; incomplete: boolean } {
  return {
    text: fmtByCurrency(totals.map((t) => [t.currency, t.selling])),
    incomplete: totals.some((t) => t.missingSellingRates.length > 0),
  };
}

const businessDayParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });

// The day (YYYY-MM-DD) of a moment on the company's calendar, which is Prague's wherever the
// viewer sits. The server counts by that day (apps/api/lib/businessDate.ts) - validity, and the
// days a list is filtered by - so what a screen says about a day is said by the same one.
export function businessDay(at: Date): string {
  const parts = Object.fromEntries(businessDayParts.formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function businessToday(): string {
  return businessDay(new Date());
}

// The last day of validity of a quote sent at `sentAt` as "valid N days": the sent day + N on the
// viewer's calendar. Null when the sent date cannot be read.
export function validUntilAfter(sentAt: string | Date, days: number): string | null {
  const sent = dayjs(sentAt);
  return sent.isValid() ? sent.add(days, "day").format("YYYY-MM-DD") : null;
}

// The "Valid until" date the printed quotation shows: the date written on the quote. A quote sent
// before that date was written on sending carries "valid N days" instead and is valid until the
// sent day + N. Null for a quote that promises no validity. Whether a quote has expired is not
// worked out from it: the screens show the status the server gives.
export function quoteValidUntil(data: SalesQuoteData): string | null {
  return data.validUntil || (data.sentAt && data.validityDays ? validUntilAfter(data.sentAt, data.validityDays) : null);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// How many days the quotation has been with the customer: since it was last sent. Null for a
// quote without a sent date and for one that is won or lost - a decided quote is not open any
// more, and a counter that keeps running on it reads as a problem.
export function daysOpen(quote: SalesQuote): number | null {
  if (!quote.sentAt || quote.status === "won" || quote.status === "lost") return null;
  return Math.floor((Date.now() - new Date(quote.sentAt).getTime()) / DAY_MS);
}

// Whether the customer should be contacted again is the server's answer: one rule for the flag
// and for the "needs follow-up" filter, judged at the moment the list was read.
export function needsFollowUp(quote: SalesQuote): boolean {
  return quote.followUpDue;
}

// How long ago the customer last heard from us, in days of 24 hours - the way the three days
// until a follow-up is due are counted, so "3 days ago" is when the flag comes on. Null when no
// contact is recorded: the quote never got a sent date.
export function lastContactAgo(lastContactAt: string | null): string | null {
  if (!lastContactAt) return null;
  const days = Math.floor((Date.now() - new Date(lastContactAt).getTime()) / DAY_MS);
  if (days < 1) return "less than a day ago";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export interface CsvColumn {
  title: string;
  accessor: (q: SalesQuote) => string;
}

export function exportQuotesCsv(quotes: SalesQuote[], columns: CsvColumn[]): void {
  const headers = columns.map((c) => c.title);
  const rows = quotes.map((q) => columns.map((c) => c.accessor(q)));
  downloadCsv(`quotes-${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
}
