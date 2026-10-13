// A sales quote is stored as one JSON document (quote.data). This file knows which of its keys
// belong to whom, and reads the few values the server has to understand. The document comes
// from browsers, so nothing about its shape is taken for granted.

/**
 * Keys only the server writes: the reference, the lifecycle (status, dates, validity, owner,
 * history) and what the lifecycle keeps aside. A save of the document never changes them.
 */
export const PROTECTED_KEYS = [
  "reference",
  "quoteStatus",
  "substatus",
  "lostReason",
  "lostComment",
  "sentAt",
  "decidedAt",
  "validUntil",
  "validityDays",
  "winProbability",
  "timeline",
  "salesOwner",
  "lifecycleUnreadable",
  "timelineUnreadable",
] as const;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The document without the keys only the server writes. */
export function stripProtected(doc: Record<string, unknown>): Record<string, unknown> {
  const protectedKeys: readonly string[] = PROTECTED_KEYS;
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !protectedKeys.includes(key)));
}

/**
 * The document a quote starts with: the caller's fields without the keys only the server
 * writes, the reference the quote was given, and the lifecycle keys of its first state.
 * `method` says how the quote was entered and is "manual" unless the caller names another.
 */
export function newDocument(
  reference: string,
  fields: Record<string, unknown>,
  lifecycle: Record<string, unknown>,
): Record<string, unknown> {
  return { method: "manual", ...stripProtected(fields), reference, ...lifecycle };
}

/**
 * The keys a save takes from the stored document instead of the incoming one: those only the
 * server writes. Every other key of the document is the editor's to change.
 */
export function carryKeys(): string[] {
  return [...PROTECTED_KEYS];
}

function quoteCurrency(doc: Record<string, unknown>): string {
  return typeof doc.currency === "string" && doc.currency ? doc.currency : "EUR";
}

function costLines(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

/**
 * The currencies whose rate a quote's totals depend on, sorted. A line in another currency
 * than the quote's is converted through CZK, which takes the rate of both; CZK is the base and
 * needs none. Same rule as ratesNeeded in the web (app/sales/_lib/salesQuote.ts) - the server
 * only decides which rates to store and never converts an amount.
 */
export function ratesNeeded(doc: Record<string, unknown>): string[] {
  const to = quoteCurrency(doc);
  const needed = new Set<string>();
  for (const line of [...costLines(doc.sellingLines), ...costLines(doc.buyingLines)]) {
    const from = typeof line.currency === "string" && line.currency ? line.currency : to;
    if (from !== to) needed.add(from).add(to);
  }
  needed.delete("CZK");
  return [...needed].sort();
}

/**
 * The quote's rates after taking, from the Exchange sheet the sender saw, the rate of every
 * currency it converts and stores none for; null when there is nothing to take. Stored when
 * the quote is sent, so next week's sheet does not change what the customer was given. A
 * stored rate is never replaced.
 */
export function ratesToStamp(
  doc: Record<string, unknown>,
  exchange: { rates: Record<string, number>; week?: string },
): Record<string, unknown> | null {
  const stored = isPlainObject(doc.rates) ? doc.rates : {};
  // CZK per 1 unit, with the Exchange week the rate was entered for.
  const taken: Record<string, { rate: number; week?: string }> = {};
  for (const currency of ratesNeeded(doc)) {
    const rate = exchange.rates[currency];
    if (stored[currency] || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    taken[currency] = exchange.week ? { rate, week: exchange.week } : { rate };
  }
  return Object.keys(taken).length ? { ...stored, ...taken } : null;
}
