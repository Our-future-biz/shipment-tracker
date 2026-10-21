import type { PriceLine } from "../interfaces/interfaces";

// Pricing a consignment from a sales quote (decision 10, C9): which quote may be used, and the
// price it gives - built from the quote's trucking selling lines as they stand (edited or not),
// each line valued by its amount, in the one currency they share. Pure.

/** tariffRef of a quote line priced from a trucking tariff. */
const TRUCKING_REF_PREFIX = "trucking:";

/** Quote statuses a consignment may be priced from: sent to the customer (quoted, feedback) or won. */
export const PRICEABLE_QUOTE_STATUSES = ["quoted", "feedback", "won"];

/** What of a quote the rules read (quotes.salesQuoteGet). */
export interface QuoteFacts {
  quoteNumber: string;
  customerId: string | null;
  status: string;
  effectiveStatus: string;
  validUntil: string | null;
  /** The road margin as the quote works it out on read; null when the rule does not apply */
  roadMargin: { needsApproval: boolean } | null;
  data: unknown;
}

/** What the consignment asks of the quote. */
export interface QuoteUse {
  customerId: string;
  fromPostcode: string;
  toPostcode: string;
  scope: string;
  /** Prague day */
  today: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** "602 00" / "60200" → "60200" (spaces dropped, capitals). */
const postcodeKey = (p: unknown) => (typeof p === "string" ? p.replace(/\s+/g, "").toUpperCase() : "");

/** Why a consignment may not be priced from the quote, or null. */
export function quoteRefusal(q: QuoteFacts, use: QuoteUse): string | null {
  const name = `Quote ${q.quoteNumber}`;
  if (q.customerId !== use.customerId) return `${name} is for another customer`;
  if (q.status === "lost" || q.effectiveStatus === "lost") return `${name} is lost`;
  const data = isObject(q.data) ? q.data : {};
  // Replaced: sent, then revised - the revision (data.replacedBy, the server's key) is the quote now.
  if (q.status === "replaced") {
    const revision = typeof data.replacedBy === "string" && data.replacedBy ? ` ${data.replacedBy}` : "";
    return `${name} was replaced by its revision${revision}: price from that one`;
  }
  if (!PRICEABLE_QUOTE_STATUSES.includes(q.status)) return `${name} has not been sent to the customer: only a quoted or won quote can price a consignment`;
  if (q.effectiveStatus === "expired" || (q.validUntil !== null && q.validUntil < use.today)) return `${name} is no longer valid (valid until ${q.validUntil ?? "—"})`;
  if (!isObject(data.roadPricing) || !isObject(data.roadPricing.sell)) return `${name} was not priced from the trucking tariffs`;
  if (q.roadMargin?.needsApproval) return `${name} has a margin below the floor that no manager approved`;
  const road = isObject(data.road) ? data.road : null;
  if (!road) return `${name} names no lane: price it from the tariffs again`;
  if (postcodeKey(road.fromPostcode) !== postcodeKey(use.fromPostcode) || postcodeKey(road.toPostcode) !== postcodeKey(use.toPostcode)) {
    return `${name} is for ${String(road.fromPostcode)} → ${String(road.toPostcode)}: the consignment must have the same pick-up and delivery postcodes`;
  }
  if (road.scope !== use.scope) return `${name} is priced for ${String(road.scope)}, not ${use.scope}`;
  return null;
}

/**
 * A line's value: its amount (what the quote editor shows and a user may change by hand); qty ×
 * unit price only when it has no amount - the rule of the quote's margin gate (C4).
 */
export function quoteLineValue(line: Record<string, unknown>): number {
  const amount = isNumber(line.amount) ? line.amount : typeof line.amount === "string" && line.amount.trim() !== "" ? Number(line.amount) : NaN;
  if (Number.isFinite(amount)) return amount;
  if (isNumber(line.qty) && isNumber(line.unitPrice)) return line.qty * line.unitPrice;
  return 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The price lines of the quote's trucking selling lines as they stand, in their one currency (a
 * line's own, else the quote's, EUR when it names none); an error when there are none or their
 * currencies differ (or are not CZK / EUR).
 */
export function quoteSellLines(q: Pick<QuoteFacts, "quoteNumber" | "data">): { ok: true; currency: "CZK" | "EUR"; total: number; lines: PriceLine[] } | { ok: false; reason: string } {
  const data = isObject(q.data) ? q.data : {};
  const quoteCurrency = typeof data.currency === "string" && data.currency ? data.currency : "EUR";
  const trucking = (Array.isArray(data.sellingLines) ? data.sellingLines : []).filter(
    (l): l is Record<string, unknown> => isObject(l) && typeof l.tariffRef === "string" && l.tariffRef.startsWith(TRUCKING_REF_PREFIX),
  );
  if (!trucking.length) return { ok: false, reason: `Quote ${q.quoteNumber} has no trucking selling lines` };
  const currencies = [...new Set(trucking.map((l) => (typeof l.currency === "string" && l.currency ? l.currency : quoteCurrency)))];
  if (currencies.length > 1) return { ok: false, reason: `Quote ${q.quoteNumber} sells road transport in ${currencies.join(" and ")}: one currency only` };
  const currency = currencies[0]!;
  if (currency !== "CZK" && currency !== "EUR") return { ok: false, reason: `Quote ${q.quoteNumber} sells road transport in ${currency}: only CZK or EUR` };
  const lines = trucking.map(
    (l): PriceLine => ({
      code: String(l.chargeCode ?? "road_freight"),
      label: String(l.description ?? ""),
      qty: isNumber(l.qty) ? l.qty : 1,
      unit: String(l.unit ?? ""),
      unitPrice: isNumber(l.unitPrice) ? l.unitPrice : quoteLineValue(l),
      amount: round2(quoteLineValue(l)),
    }),
  );
  return { ok: true, currency, total: round2(lines.reduce((a, l) => a + l.amount, 0)), lines };
}
