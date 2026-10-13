// Money helpers shared by the customer pages and Sales, so a figure reads and is typed the same
// wherever it appears.

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
