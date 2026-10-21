// The reference of a sales quote: QCZ + the business day it was created on (YYYYMMDD) + that
// day's sequence within the company (001, 002, ... 999, 1000). A variant made by duplicating
// keeps the reference of the quote it branches off and adds -2, -3, ... A revision of a quote
// that was sent keeps that quote's reference and adds -R1, -R2, ... (QCZ…001-R1, QCZ…001-2-R1).

/**
 * One definition of the format for TypeScript and SQL: this text is the RegExp below and is
 * also handed to Postgres as a parameter, so it uses only syntax both read the same way.
 */
export const SALES_REFERENCE_PATTERN = "^QCZ[0-9]{8}[0-9]{3,}(-[0-9]+)?(-R[0-9]+)?$";

const SALES_REFERENCE = new RegExp(SALES_REFERENCE_PATTERN);

export function isSalesReference(ref: string): boolean {
  return SALES_REFERENCE.test(ref);
}

/** What every reference of a business day (YYYY-MM-DD) starts with. */
export function salesPrefix(ymd: string): string {
  return `QCZ${ymd.replaceAll("-", "")}`;
}

/**
 * The next free sequence number under a prefix, given every reference that exists - deleted
 * quotes included, so a number is never handed out twice. Variants (QCZ…001-2) take no number
 * of their own, and a reference whose rest is not a number is not counted.
 *
 * Counted as bigint: the table also holds numbers nobody allocated here (the old quotes module
 * stored whatever it was sent), and past 2^53 a JavaScript number + 1 is the same number again -
 * the allocation would then pick one reference for ever.
 */
export function nextSequence(prefix: string, existing: string[]): bigint {
  let highest = 0n;
  for (const ref of existing) {
    if (!ref.startsWith(prefix)) continue;
    const rest = ref.slice(prefix.length);
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
 */
export function nextRevision(root: string, existing: string[]): string {
  let highest = 0n;
  for (const ref of existing) {
    if (!ref.startsWith(`${root}-R`)) continue;
    const suffix = ref.slice(root.length + 2);
    if (!/^[0-9]+$/.test(suffix)) continue;
    const revision = BigInt(suffix);
    if (revision > highest) highest = revision;
  }
  return `${root}-R${highest + 1n}`;
}

/**
 * The reference of the next variant of `base`, given every reference that exists. The base
 * itself counts as variant 1, so the first duplicate is -2.
 */
export function nextVariant(base: string, existing: string[]): string {
  let highest = 1n;
  for (const ref of existing) {
    if (!ref.startsWith(`${base}-`)) continue;
    const suffix = ref.slice(base.length + 1);
    if (!/^[0-9]+$/.test(suffix)) continue;
    const variant = BigInt(suffix);
    if (variant > highest) highest = variant;
  }
  return `${base}-${highest + 1n}`;
}
