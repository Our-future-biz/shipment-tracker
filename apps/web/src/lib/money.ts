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

// ── Display and input helpers of the customer pages and Sales ──

// "12,345 EUR"; cents are shown only when the amount has them, and then always as two digits ("1,234.50 EUR").
// A document lists amounts one under another: with `alwaysCents` each shows them ("12,345.00 EUR"),
// so a column of prices lines up.
export function fmtMoney(n: number | null | undefined, currency = "EUR", alwaysCents = false): string {
  // Whole cents first: sums of amounts carry float residue (500.20000000000005), which must not
  // decide whether cents are shown nor print as "-0".
  const cents = typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : 0;
  const value = cents / 100 || 0;
  const showCents = alwaysCents || cents % 100 !== 0;
  return `${value.toLocaleString("en-US", { minimumFractionDigits: showCents ? 2 : 0, maximumFractionDigits: 2 })} ${currency}`;
}

// A difference of two amounts, rounded to cents so float residue never reads as "below zero".
export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100 || 0;
}

// Amounts are typed with a decimal comma ("1234,56") but shown with comma thousands ("12,345"), so a
// comma is the decimal mark when it follows a dot, or when it is the only comma and the text cannot
// be a thousands figure. That figure has one shape - up to three digits, the comma, exactly three
// digits ("1,250") - so a single comma anywhere else keeps its decimals: "0,125", "1250,555".
export function normalizeMoneyInput(text: string | undefined): string {
  const cleaned = (text ?? "").replace(/[^\d.,-]+/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  if (lastComma === -1) return cleaned;
  const lastDot = cleaned.lastIndexOf(".");
  const thousands = /^-?[1-9]\d{0,2},\d{3}$/.test(cleaned);
  const commaIsDecimal = lastDot === -1 ? cleaned.indexOf(",") === lastComma && !thousands : lastComma > lastDot;
  if (!commaIsDecimal) return cleaned.replace(/,/g, "");
  return `${cleaned.slice(0, lastComma).replace(/[.,]/g, "")}.${cleaned.slice(lastComma + 1)}`;
}

// For antd InputNumber's `parser`. It is typed as returning the value type, but the component parses
// the returned text itself (its default parser returns text too), which keeps an emptied field empty.
export const moneyInputParser = (text: string | undefined) => normalizeMoneyInput(text) as unknown as number;
