// The reference of a sales quote: QCZ + the letters of its Freight Mode + the business day it was
// created on (YYYYMMDD) + that day's sequence within the company (001, 002, ... 999, 1000). A
// variant made by duplicating keeps the reference of the quote it branches off and adds -2, -3, ...
// A revision of a quote that was sent keeps that quote's reference and adds -R1, -R2, ...
// (QCZLCL20261109001-R1, QCZAIR20261109001-2-R1).
//
// The letters (owner decision, 10 Nov 2026) say what the quote is, as a shipment's Internal Reference
// does (CZLCL…): QCZAIR, QCZLCL, QCZFCL, QCZBB, QCZRAIL, QCZROAD; none while it has no Freight Mode
// (QCZ20261109001). They follow the Freight Mode while the quote is open and stay once it is Won,
// Lost, Expired or Replaced. So the letters are only a label: a number is counted, grouped (variants,
// revisions, its chat) and looked up without them (plainSalesReference) - a copy of the number kept
// elsewhere, or a page still showing the old one, names the same quote.

/**
 * One definition of the format for TypeScript and SQL: this text is the RegExp below and is
 * also handed to Postgres as a parameter, so it uses only syntax both read the same way.
 */
export const SALES_REFERENCE_PATTERN = "^QCZ(?:RAIL|ROAD|AIR|FCL|LCL|BB)?[0-9]{8}[0-9]{3,}(-[0-9]+)?(-R[0-9]+)?$";

/** The letters a quote's reference may carry after "QCZ", longest first so a pattern tries them in order. */
export const SALES_REFERENCE_LETTERS = ["RAIL", "ROAD", "AIR", "FCL", "LCL", "BB"] as const;
export type SalesReferenceLetters = (typeof SALES_REFERENCE_LETTERS)[number];

/**
 * The letters right after "QCZ" and the day after them: what regexp_replace (Postgres, with
 * PLAIN_SALES_REFERENCE_REPLACEMENT) and plainSalesReference take away to make a reference plain.
 */
export const LETTERED_SALES_REFERENCE = `^QCZ(${SALES_REFERENCE_LETTERS.join("|")})([0-9]{8})`;
export const PLAIN_SALES_REFERENCE_REPLACEMENT = "QCZ\\2";
const LETTERED = new RegExp(LETTERED_SALES_REFERENCE);

// The quote's Freight Mode as it stores it (Air, Sea FCL, Sea LCL, Sea Break Bulk, Rail, Road).
const LETTERS_OF: Record<string, SalesReferenceLetters> = {
  air: "AIR",
  "sea fcl": "FCL",
  "sea lcl": "LCL",
  "sea break bulk": "BB",
  rail: "RAIL",
  road: "ROAD",
};

/** The letters of a quote with this Freight Mode; "" while it has none (or one not listed). */
export function salesReferenceLetters(serviceType: unknown): SalesReferenceLetters | "" {
  return typeof serviceType === "string" ? (LETTERS_OF[serviceType.trim().toLowerCase()] ?? "") : "";
}

/** The reference without its letters: QCZLCL20261109001-2 → QCZ20261109001-2. Other text stays as it is. */
export function plainSalesReference(ref: string): string {
  return ref.replace(LETTERED, "QCZ$2");
}

/**
 * The reference with the letters this Freight Mode gives it, the rest kept: QCZ20261109001 as a
 * Sea LCL quote → QCZLCL20261109001, and back to plain without a Freight Mode. Text that is no
 * quote reference stays as it is.
 */
export function salesReferenceFor(ref: string, serviceType: unknown): string {
  if (!isSalesReference(ref)) return ref;
  return `QCZ${salesReferenceLetters(serviceType)}${plainSalesReference(ref).slice(3)}`;
}

/** Whether two references name the same quote, whatever letters either carries. */
export const sameSalesReference = (a: string, b: string): boolean => plainSalesReference(a.trim()) === plainSalesReference(b.trim());

const SALES_REFERENCE = new RegExp(SALES_REFERENCE_PATTERN);

/** Whether a text is a quote's reference, with or without letters. */
export function isSalesReference(ref: string): boolean {
  return SALES_REFERENCE.test(ref);
}

/** What every reference of a business day (YYYY-MM-DD) starts with, once without its letters. */
export function salesPrefix(ymd: string): string {
  return `QCZ${ymd.replaceAll("-", "")}`;
}

/**
 * The next free sequence number under a prefix, given every reference that exists - deleted
 * quotes included, so a number is never handed out twice. Variants (QCZ…001-2) take no number
 * of their own, and a reference whose rest is not a number is not counted. Counted without the
 * letters: QCZAIR20261109001 and QCZLCL20261109002 are numbers 1 and 2 of the day.
 *
 * Counted as bigint: the table also holds numbers nobody allocated here (the old quotes module
 * stored whatever it was sent), and past 2^53 a JavaScript number + 1 is the same number again -
 * the allocation would then pick one reference for ever.
 */
export function nextSequence(prefix: string, existing: string[]): bigint {
  let highest = 0n;
  for (const ref of existing) {
    const plain = plainSalesReference(ref);
    if (!plain.startsWith(prefix)) continue;
    const rest = plain.slice(prefix.length);
    if (!/^[0-9]+$/.test(rest)) continue;
    const seq = BigInt(rest);
    if (seq > highest) highest = seq;
  }
  return highest + 1n;
}

/** Three digits, growing past 999 instead of wrapping. */
export function formatReference(prefix: string, seq: bigint): string {
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

/** The reference a variant or a revision branches off: QCZ…001-3, QCZ…001-R2 and QCZ…001-3-R1 belong to QCZ…001. */
export function baseReference(ref: string): string {
  return ref.replace(/-R[0-9]+$/, "").replace(/-[0-9]+$/, "");
}

/** The quote a revision revises, counted from: QCZ…001-R2 and QCZ…001 both revise as QCZ…001. */
export function revisionRoot(ref: string): string {
  return ref.replace(/-R[0-9]+$/, "");
}

/**
 * The reference of the next revision of `root`, given every reference that exists: -R1 for the
 * first, then the next free number - a revision of a revision is numbered from the same root.
 * Counted without the letters; the result keeps `root`'s.
 */
export function nextRevision(root: string, existing: string[]): string {
  let highest = 0n;
  const plainRoot = plainSalesReference(root);
  for (const ref of existing.map(plainSalesReference)) {
    if (!ref.startsWith(`${plainRoot}-R`)) continue;
    const suffix = ref.slice(plainRoot.length + 2);
    if (!/^[0-9]+$/.test(suffix)) continue;
    const revision = BigInt(suffix);
    if (revision > highest) highest = revision;
  }
  return `${root}-R${highest + 1n}`;
}

/**
 * The reference of the next variant of `base`, given every reference that exists. The base
 * itself counts as variant 1, so the first duplicate is -2. Counted without the letters (an AIR
 * variant and a LCL one of the same quote share the count); the result keeps `base`'s.
 */
export function nextVariant(base: string, existing: string[]): string {
  let highest = 1n;
  const plainBase = plainSalesReference(base);
  for (const ref of existing.map(plainSalesReference)) {
    if (!ref.startsWith(`${plainBase}-`)) continue;
    const suffix = ref.slice(plainBase.length + 1);
    if (!/^[0-9]+$/.test(suffix)) continue;
    const variant = BigInt(suffix);
    if (variant > highest) highest = variant;
  }
  return `${base}-${highest + 1n}`;
}

/**
 * The chat thread of a quote: its revision root without letters, so a quote, its revisions and its
 * renames (QCZ20261109001 → QCZLCL20261109001) share one conversation.
 */
export const quoteThreadOf = (ref: string): string => revisionRoot(plainSalesReference(ref.trim()));
