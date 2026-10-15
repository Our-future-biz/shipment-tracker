// A sales quote is stored as one JSON document (quote.data). This file knows which of its keys
// belong to whom, and reads the few values the server has to understand. The document comes
// from browsers, so nothing about its shape is taken for granted.

/**
 * Keys only the server writes: the reference, the lifecycle (status, dates, validity, owner,
 * history), what the lifecycle keeps aside, and the rates a sent quote is priced with (`fx`, the
 * ČNB rates stamped on sending; `rates`, what older quotes stored from the retired weekly
 * sheet), and what a pricing from the trucking tariffs recorded and a manager's approval of its
 * margin (`roadPricing`, `marginApproval`). A save of the document never changes them.
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
  "fx",
  "rates",
  "roadPricing",
  "marginApproval",
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
