// Quote references. Pure helpers so the numbering rules can be unit-tested.

/** The sales reference prefix of a day: QCZ{YYYYMMDD}. */
export function salesRefPrefix(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `QCZ${y}${m}${d}`;
}

/**
 * The next base reference of the day: one past the highest NNN already used under `prefix`.
 * Duplicates (QCZ…001-2) don't count as base references.
 */
export function nextSalesRef(prefix: string, existing: string[]): string {
  let max = 0;
  for (const n of existing) {
    const rest = n.slice(prefix.length);
    if (rest.includes("-")) continue;
    const seq = parseInt(rest, 10);
    if (!Number.isNaN(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** The duplicate-suffix base of a reference: QCZ…001-3 → QCZ…001. */
export const baseRef = (ref: string): string => ref.replace(/-\d+$/, "");

/**
 * The next duplicate of `base`, given every reference starting with `${base}-`: the first copy
 * is -2 (the original counts as 1), then one past the highest suffix used.
 */
export function nextDuplicateRef(base: string, existing: string[]): string {
  let max = 1;
  for (const n of existing) {
    const seq = parseInt(n.slice(base.length + 1), 10);
    if (!Number.isNaN(seq) && seq > max) max = seq;
  }
  return `${base}-${max + 1}`;
}

/** A sub-line reference: QCZ…001-007. */
export const subLineRef = (quoteNumber: string, subLine: number): string =>
  `${quoteNumber}-${String(subLine).padStart(3, "0")}`;
