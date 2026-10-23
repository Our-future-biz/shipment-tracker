import type { interfaces } from "@/lib/api/client";
import { downloadCsv } from "@/lib/csv";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { fmtMoney, roundCents } from "@/lib/money";
import type { SalesQuoteData, CostLine, PackageLine, QuoteContainerLine, TimelineEntry } from "./types";
import { teuForType } from "@/lib/cargo";
import { businessDay, businessToday, formatDate } from "@/lib/date";
import { FX_DRAFT_STATUSES, PRICING_CLOSED_STATUSES, PRICING_KEYS, PROTECTED_KEYS, type QuoteStatus } from "./types";

// A sales quote as the lists, reports and pickers work with it: its document, and next to it what
// the server keeps and works out about the quote. Those facts are read from here and not from the
// document's own copies of them (data.quoteStatus, data.validUntil, data.salesOwner): the copies
// cannot say "expired" and know the owner only as text.
export type SalesQuote = Pick<
  interfaces.SalesQuoteItem,
  "quoteNumber" | "createdAt" | "updatedAt" | "ownerUserId" | "ownerName" | "sentAt" | "validUntil" | "lastContactAt" | "followUpDue" | "shipmentId" | "shipmentJobNumber"
> & {
  data: SalesQuoteData;
  /** The status to show: "expired" for a Quoted or Feedback quote whose validity has passed. */
  status: QuoteStatus;
  /** The status as stored - what an expired quote still is underneath. */
  storedStatus: QuoteStatus;
  /** The statuses the quote may be set to now. */
  allowedTransitions: QuoteStatus[];
};

export function asData(d: unknown): SalesQuoteData {
  return d && typeof d === "object" && !Array.isArray(d) ? (d as SalesQuoteData) : {};
}

/**
 * What the user changed in `draft` against the stored document it was based on: every key the
 * user may edit whose value differs. Re-applied on top of a newer stored version after a conflict.
 */
export function unsavedChanges(base: SalesQuoteData, draft: SalesQuoteData): Partial<SalesQuoteData> {
  const own = stripProtected(draft);
  const keys = new Set([...Object.keys(stripProtected(base)), ...Object.keys(own)]) as Set<keyof SalesQuoteData>;
  const changed: Partial<SalesQuoteData> = {};
  for (const key of keys) {
    if (JSON.stringify(own[key]) !== JSON.stringify(base[key])) Object.assign(changed, { [key]: own[key] });
  }
  return changed;
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

// The contacts with the customer recorded on a quote, newest first: who, when, and the note they
// left, if any. A recorded follow-up is one (applyFollowUp in
// apps/api/services/quotes/utils/quoteLifecycle.utils.ts), and so is a change to Feedback - the
// server starts the follow-up clock again on it too.
export function followUpLines(data: SalesQuoteData): TimelineEntry[] {
  const { timeline } = data;
  if (!Array.isArray(timeline)) return [];
  return timeline
    .filter((entry) => entry && typeof entry === "object" && typeof entry.at === "string" && (entry.kind === "follow_up" || isFeedbackLine(entry)))
    .reverse();
}

/** Whether a line of a quote's history is the change of its status to Feedback. */
export function isFeedbackLine(entry: TimelineEntry): boolean {
  return (!entry.kind || entry.kind === "status") && entry.status === "feedback";
}

// The reference of a sales quote - QCZ, the day, that day's number, for a variant -2, -3, ... and
// for a revision -R1, -R2, ... - as the server gives them out (SALES_REFERENCE_PATTERN in
// apps/api/lib/salesReference.ts).
const SALES_QUOTE_REF = /^QCZ[0-9]{8}[0-9]{3,}(-[0-9]+)?(-R[0-9]+)?$/;

/** Whether a text is the reference of a sales quote, and not a number of the old quotes module or anything else. */
export function isSalesQuoteRef(ref: string): boolean {
  return SALES_QUOTE_REF.test(ref);
}

// Duplicates branch off their base reference as QCZ…-2, -3, … and the revisions of a quote that
// was sent add -R1, -R2, … (to a variant: QCZ…-2-R1). Together they form a "family" (e.g. an AIR
// and a SEA option for one enquiry, and the prices sent for each) - read as the server reads them
// (baseReference and revisionRoot in apps/api/lib/salesReference.ts).

/** The quote a revision is counted from: QCZ…001-R2 revises QCZ…001, QCZ…001-2-R1 the variant QCZ…001-2. */
export function revisionRoot(ref: string): string {
  return ref.replace(/-R\d+$/, "");
}

/** The quote a variant or a revision branches off: QCZ…001-3, QCZ…001-R2 and QCZ…001-3-R1 belong to QCZ…001. */
export function baseRef(ref: string): string {
  return revisionRoot(ref).replace(/-\d+$/, "");
}

// A quote's place in its family: its variant (the base is 1), then its revision (the quote sent first is 0).
function familyOrder(ref: string, base: string): [variant: number, revision: number] {
  const root = revisionRoot(ref);
  const variant = root === base ? 1 : parseInt(root.slice(base.length + 1), 10) || 1;
  const revision = root === ref ? 0 : parseInt(ref.slice(root.length + 2), 10) || 0;
  return [variant, revision];
}

/** The family of `ref`, in order: each variant followed by its revisions. */
export function quoteFamily(quotes: SalesQuote[], ref: string): SalesQuote[] {
  const base = baseRef(ref);
  const order = (q: SalesQuote) => familyOrder(q.quoteNumber, base);
  return quotes
    .filter((q) => baseRef(q.quoteNumber) === base)
    .sort((a, b) => {
      const [variantA, revisionA] = order(a);
      const [variantB, revisionB] = order(b);
      return variantA - variantB || revisionA - revisionB;
    });
}

/**
 * The draft after the server answered with the stored quote: the keys only the server writes are
 * taken from it and, for a quote whose prices are closed (PRICING_CLOSED_STATUSES), so are the
 * prices - the server keeps those as stored on every save, and the page shows what is stored.
 * Everything else stays as the user has it.
 */
export function followStored(draft: Partial<SalesQuoteData>, stored: SalesQuoteData, status: QuoteStatus): Partial<SalesQuoteData> {
  const next: Record<string, unknown> = stripProtected(draft);
  const data = stored as Record<string, unknown>;
  for (const key of PROTECTED_KEYS) {
    if (key in data) next[key] = data[key];
  }
  if (PRICING_CLOSED_STATUSES.includes(status)) {
    for (const key of PRICING_KEYS) {
      if (key in data) next[key] = data[key];
      else delete next[key];
    }
  }
  return next;
}

/** A patch without the keys that hold prices: what an import may change on a quote whose prices are closed. */
export function withoutPricing(patch: Partial<SalesQuoteData>): Partial<SalesQuoteData> {
  const own: Record<string, unknown> = { ...patch };
  for (const key of PRICING_KEYS) delete own[key];
  return own;
}

// Newest first, the order quotes are listed in; the reference settles it for two quotes created
// in the same instant. For lists that come from the server in no order (useAllSalesQuotes).
export function newestFirst(a: SalesQuote, b: SalesQuote): number {
  return b.createdAt.localeCompare(a.createdAt) || b.quoteNumber.localeCompare(a.quoteNumber);
}

// Freight cargo metrics. Weight and volume are the package lines added up; when the lines give
// none - no lines, or lines without a weight or without dimensions - the one weight and volume
// typed (or imported from an inquiry) for the whole shipment count instead, each on its own. The
// printed quotation and the New Shipment wizard go by them, and a figure that reaches the
// customer has to show on the screens first. Volumetric weight uses the standard air divisor of
// 6000 (cm³ → kg); chargeable weight is max(gross, volumetric). Weight / measure is the freight
// ton of sea freight: 1 t or 1 cbm, whichever is greater.
// A quote for full containers: its cargo is equipment (so many 40' HC), not packages.
export function isContainerQuote(data: Pick<SalesQuoteData, "serviceType">): boolean {
  return data.serviceType === "Sea FCL";
}

// Whether a container type is a reefer: RF, or HR (the high-cube reefer), of any size.
export function isReeferType(type: string | undefined): boolean {
  // HR is the 40' high-cube reefer's former name, still on quotes saved before it was HRF.
  return /\b(RF|HRF|HR)$/.test((type ?? "").trim());
}

// Whether a quote carries a reefer container: its reefer requirements are then asked.
export function hasReefer(data: Pick<SalesQuoteData, "serviceType" | "containers">): boolean {
  return isContainerQuote(data) && (data.containers ?? []).some((c) => isReeferType(c.type));
}

// What a reefer quote still lacks: the set-point is required, and a tolerance asked for needs its
// value. Null when nothing is missing or the quote has no reefer.
export function reeferMissing(data: Pick<SalesQuoteData, "serviceType" | "containers" | "reefer">): string | null {
  if (!hasReefer(data)) return null;
  const r = data.reefer ?? {};
  if (typeof r.setPoint !== "number") return "Enter the reefer set-point temperature";
  if (r.toleranceRequired && typeof r.tolerance !== "number") return "Enter the set-point tolerance";
  return null;
}

// A quote's containers in one phrase, "2× 40' HC, 1× 20' GP" - the shipment's own summary of its
// boxes. Lines of one type are counted together; a line of no type or no quantity says nothing.
export function fmtEquipment(lines: QuoteContainerLine[]): string {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const type = (line.type ?? "").trim();
    const qty = Number(line.qty) || 0;
    if (type && qty > 0) counts.set(type, (counts.get(type) ?? 0) + qty);
  }
  return [...counts].map(([type, qty]) => `${qty}× ${type}`).join(", ");
}

export function computeCargo(data: SalesQuoteData) {
  const pkgs = data.packages ?? [];
  const boxes = data.containers ?? [];
  const n = (v: unknown) => Number(v) || 0;
  const totalPackages = pkgs.reduce((s, p) => s + n(p.qty), 0);
  // A full-container quote: its boxes, their TEU, and the cargo weight it declares per box. That
  // weight comes before the packages' (the packages ride in the boxes) and before a typed total.
  const totalContainers = boxes.reduce((s, c) => s + n(c.qty), 0);
  const teu = boxes.reduce((s, c) => s + n(c.qty) * teuForType(c.type), 0);
  const containersWeight = boxes.reduce((s, c) => s + n(c.qty) * n(c.weight), 0);
  const packagesWeight = pkgs.reduce((s, p) => s + n(p.qty) * n(p.weight), 0);
  const weightFromContainers = containersWeight > 0;
  const linesWeight = weightFromContainers ? containersWeight : packagesWeight;
  const linesCcm = pkgs.reduce((s, p) => s + n(p.qty) * n(p.length) * n(p.width) * n(p.height), 0);
  const weightFromLines = linesWeight > 0;
  const cbmFromLines = linesCcm > 0;
  const grossWeight = weightFromLines ? linesWeight : n(data.weight);
  const cbm = cbmFromLines ? linesCcm / 1_000_000 : n(data.cbm);
  const volumetricWeight = (cbm * 1_000_000) / 6000;
  return {
    totalPackages,
    totalContainers,
    teu,
    /** The containers in one phrase, "2× 40' HC, 1× 20' GP"; empty without container lines. */
    equipment: fmtEquipment(boxes),
    grossWeight: Math.round(grossWeight * 100) / 100,
    cbm: Math.round(cbm * 1000) / 1000,
    /** Whether the weight / the volume are the lines' sum (containers' or packages'); otherwise they are the shipment's typed total. */
    weightFromLines,
    /** Whether the weight is the container lines' sum. */
    weightFromContainers,
    cbmFromLines,
    volumetricWeight: Math.round(volumetricWeight * 100) / 100,
    chargeableWeight: Math.round(Math.max(grossWeight, volumetricWeight) * 100) / 100,
    weightMeasure: Math.round(Math.max(grossWeight / 1000, cbm) * 1000) / 1000,
    /** Cbm per ton of cargo (volume ÷ weight in tons); null until both are known. */
    weightRatio: grossWeight > 0 && cbm > 0 ? Math.round((cbm / (grossWeight / 1000)) * 100) / 100 : null,
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
// as in the shipment costs. `sheet` in the functions below is today's ČNB fixing and `live` today's
// fixing date and company ROE % (both from useCurrentExchangeRates). A quote that was sent carries
// its own ČNB snapshot (`fx`, stored by the server), which wins over both.

/** Today's pricing a draft is shown with: the ČNB fixing date and the company ROE %. */
export interface LivePricing {
  roePct: number;
  fixingDate: string;
}

/** Today's ČNB rates with their fixing date and ROE % - what a list prices its quotes with. */
export interface QuotePricing extends LivePricing {
  rates: ExchangeRates;
}

// A quote whose currency was never changed stores none and is in EUR.
export function quoteCurrency(data: SalesQuoteData): string {
  return data.currency || "EUR";
}

// CZK per 1 unit of `currency` for this quote. A sent quote uses its ČNB snapshot (`fx`); one sent
// before snapshots existed keeps the rates it stored (`rates`, the weekly sheet's back then). A
// draft is priced at today's ČNB fixing, its own `rates` only filling a currency ČNB does not
// publish. Null when none knows the currency: it is then left out, never converted at 1.
function rateOf(currency: string, data: SalesQuoteData, sheet: ExchangeRates): number | null {
  if (currency === "CZK") return 1;
  const own = data.rates?.[currency]?.rate;
  const draft = FX_DRAFT_STATUSES.has(data.quoteStatus ?? "draft");
  const rate = data.fx?.rates?.[currency] ?? (draft ? (sheet[currency] ?? own) : (own ?? sheet[currency]));
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}

// The company ROE % a quote's selling lines in another currency carry: the one stored with a sent
// quote's rates, today's on a draft. 100 = pure ČNB.
function roeOf(data: SalesQuoteData, live?: LivePricing): number {
  return data.fx?.roePct ?? live?.roePct ?? 100;
}

// One cost line in the quote's currency, rounded to cents on its own, so the lines a screen shows
// add up to exactly the total it shows. A selling line made in another currency also carries the
// ROE % (the FX buffer); a buying line never does. Null when a rate it needs is missing.
export function convertLine(
  line: CostLine,
  data: SalesQuoteData,
  sheet: ExchangeRates,
  opts: { selling?: boolean; live?: LivePricing } = {},
): number | null {
  const to = quoteCurrency(data);
  const from = line.currency || to;
  const amount = Number(line.amount) || 0;
  if (from === to) return roundCents(amount);
  const fromRate = rateOf(from, data, sheet);
  const toRate = rateOf(to, data, sheet);
  if (fromRate === null || toRate === null) return null;
  const roe = opts.selling ? roeOf(data, opts.live) / 100 : 1;
  return roundCents(((amount * fromRate) / toRate) * roe);
}

function sumLines(lines: CostLine[] | undefined, data: SalesQuoteData, sheet: ExchangeRates, selling: boolean, live?: LivePricing) {
  const to = quoteCurrency(data);
  const missingRates = new Set<string>();
  let total = 0;
  for (const line of lines ?? []) {
    const converted = convertLine(line, data, sheet, { selling, live });
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
  /** ROE % applied to selling lines in another currency (100 = pure ČNB). */
  roePct: number;
  /** The ČNB fixing the rates come from; null while today's are loading. */
  fixingDate: string | null;
  /** The rates are the quote's own, stored by the server when it was sent. */
  fxLocked: boolean;
  /** When they were stored. */
  lockedAt: string | null;
}

export function computeTotals(data: SalesQuoteData, sheet: ExchangeRates, live?: LivePricing): QuoteTotals {
  const selling = sumLines(data.sellingLines, data, sheet, true, live);
  const buying = sumLines(data.buyingLines, data, sheet, false, live);
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
    roePct: roeOf(data, live),
    fixingDate: data.fx?.fixingDate ?? (live?.fixingDate || null),
    fxLocked: !!data.fx,
    lockedAt: data.fx?.lockedAt ?? null,
  };
}

// The profit a quote calculated, in `currency`: converted from the quote's currency at the quote's
// own rates (those stored when it was sent), so it stays the figure the quote was sold at. Null
// when a rate it needs is missing.
export function quoteProfitIn(data: SalesQuoteData, sheet: ExchangeRates, currency: string): number | null {
  const { profit, currency: from } = computeTotals(data, sheet);
  if (from === currency) return profit;
  const fromRate = rateOf(from, data, sheet);
  const toRate = rateOf(currency, data, sheet);
  return fromRate === null || toRate === null ? null : roundCents((profit * fromRate) / toRate);
}

// One line saying which rates a quote's totals use - for the people pricing it.
export function fxNote(totals: QuoteTotals): string {
  const currency = totals.currency;
  if (!totals.fixingDate) return `Totals in ${currency}. Loading today's ČNB rates…`;
  const roe = totals.roePct !== 100 ? ` · selling lines in another currency × ROE ${totals.roePct} %` : "";
  return totals.fxLocked
    ? `Totals in ${currency} at the ČNB rates of ${formatDate(totals.fixingDate)}${roe} — stored when the quote was sent ${formatDate(totals.lockedAt ?? "")}.`
    : `Totals in ${currency} at today's ČNB rates (${formatDate(totals.fixingDate)})${roe} — stored on the quote when it is sent.`;
}

// The clause for the customer's document when charges in another currency were converted.
export function fxClause(data: SalesQuoteData, totals: QuoteTotals): string {
  const currency = quoteCurrency(data);
  const foreign = (data.sellingLines ?? []).some((l) => (l.currency || currency) !== currency);
  if (!foreign || !totals.fixingDate) return "";
  const buffer = totals.roePct !== 100 ? ` (+${Math.round((totals.roePct - 100) * 1000) / 1000} %)` : "";
  return `Charges in other currencies converted to ${currency} at the ČNB rate of ${formatDate(totals.fixingDate)}${buffer}. Rates subject to ROE fluctuation; final amounts at the ČNB rate on the invoice date.`;
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

// Why the customer's document must not be printed or sent, or null when it may be: a total that
// leaves selling lines out would offer the customer a wrong price. `sheetFailed`: the Exchange
// sheet could not be read, so the rates are not known to be missing and nobody is told to type one.
export function documentBlock(totals: QuoteTotals, sheetFailed: boolean): string | null {
  if (!totals.missingSellingRates.length) return null;
  if (sheetFailed) {
    return "Today's ČNB rates could not be loaded, so the total for the customer cannot be worked out. Try again in a moment.";
  }
  return `ČNB publishes no rate for ${totals.missingSellingRates.join(", ")}, so the total for the customer cannot be worked out. Price those lines in a currency ČNB publishes.`;
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

export { businessDay, businessToday } from "@/lib/date";

// The last day of validity of a quote sent at `sentAt` as "valid N days": the sent day + N on the
// company's (Prague) calendar, as the server counts. Null when the sent date cannot be read.
export function validUntilAfter(sentAt: string | Date, days: number): string | null {
  const sent = new Date(sentAt);
  if (Number.isNaN(sent.getTime())) return null;
  const [y, m, d] = businessDay(sent).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
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
  downloadCsv(`quotes-${businessToday()}.csv`, [headers, ...rows]);
}
