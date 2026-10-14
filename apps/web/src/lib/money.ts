/**
 * Shared money helpers: parsing what users type, rounding and formatting amounts.
 *
 * Users type Czech style ("1 234,50") as well as English style ("1,234.50"), so plain
 * parseFloat is never used for amounts - it reads "1 250,50" as 1.
 */

/**
 * Tolerant number parsing. Handles a decimal comma or dot, including thousands separators:
 * "1 234,56" and "1,234.56" -> 1234.56. When both separators appear, the last one is the
 * decimal one. Anything that is not a number gives 0.
 */
export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const cleaned = String(v ?? "").replace(/[^0-9.,-]/g, "");
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalised: string;
  if (lastComma > -1 && lastDot > -1) {
    // both separators - the last one is the decimal one, the other separates thousands
    const decimalAt = Math.max(lastComma, lastDot);
    normalised =
      cleaned.slice(0, decimalAt).replace(/[.,]/g, "") + "." + cleaned.slice(decimalAt + 1).replace(/[.,]/g, "");
  } else {
    // only one separator - it is the decimal one (the usual input here)
    normalised = cleaned.replace(",", ".");
  }

  const parsed = parseFloat(normalised);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Strict amount parsing for validating input. Empty text is 0; text that is not a clean
 * amount (letters, two decimal separators of the same kind, more than 2 decimals) is null,
 * so the caller can show an error instead of silently saving a wrong number.
 */
export function parseMoney(text: string | null | undefined): number | null {
  let t = String(text ?? "").replace(/[\s  ]/g, "");
  if (t === "") return 0;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    t = t.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    t = t.replace(",", ".");
  }
  return /^-?\d{1,12}(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}

/**
 * Turns a typed amount into the form the API stores ("4 999,50" -> "4999.5").
 * Empty text stays "" (clears the field); text that is not a valid amount gives null.
 */
export function normaliseAmount(text: string | null | undefined): string | null {
  if (String(text ?? "").trim() === "") return "";
  const n = parseMoney(text);
  return n === null ? null : String(n);
}

/**
 * Rounds to 2 decimals, half away from zero (1.005 -> 1.01, -1.005 -> -1.01).
 * The toPrecision step removes binary noise first: 1.005 * 100 is 100.49999999999999.
 */
export function round2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const scaled = Number((Math.abs(v) * 100).toPrecision(15));
  return (Math.sign(v) * Math.round(scaled)) / 100;
}

/** Sums amounts rounded to 2 decimals, so a total always equals the sum of its printed lines. */
export function sumRounded(values: number[]): number {
  return round2(values.reduce((s, v) => s + round2(v), 0));
}

/** Two decimals with thousands separators, English style: 1,234.50 (Costs tab, Quotes). */
export function money(v: number): string {
  return (Number.isFinite(v) ? v : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Two decimals, Czech style: 1 234,50 - for invoices issued to Czech customers. */
export function moneyCz(v: number): string {
  return (Number.isFinite(v) ? round2(v) : 0).toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
