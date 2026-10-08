// Money helpers shared by every customer view, so a figure reads the same wherever it appears.

// Shipment selling/buying arrive as numeric strings (or empty); anything unparsable counts as 0.
export function num(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "");
  return Number.isNaN(n) ? 0 : n;
}

// "12,345 EUR"; cents are shown only when the amount has them, and then always as two digits ("1,234.50 EUR").
export function fmtMoney(n: number | null | undefined, currency = "EUR"): string {
  // Whole cents first: sums of amounts carry float residue (500.20000000000005), which must not
  // decide whether cents are shown nor print as "-0".
  const cents = typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) : 0;
  const value = cents / 100 || 0;
  const hasCents = cents % 100 !== 0;
  return `${value.toLocaleString("en-US", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })} ${currency}`;
}

// A difference of two amounts, rounded to cents so float residue never reads as "below zero".
export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100 || 0;
}

// Amounts are typed with a decimal comma ("1234,56") but shown with comma thousands ("12,345"), so a
// comma is the decimal mark only when it follows a dot or is a single comma with at most two digits behind it.
export function normalizeMoneyInput(text: string | undefined): string {
  const cleaned = (text ?? "").replace(/[^\d.,-]+/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  if (lastComma === -1) return cleaned;
  const lastDot = cleaned.lastIndexOf(".");
  const digitsAfter = cleaned.length - lastComma - 1;
  const commaIsDecimal = lastDot === -1 ? cleaned.indexOf(",") === lastComma && digitsAfter <= 2 : lastComma > lastDot;
  if (!commaIsDecimal) return cleaned.replace(/,/g, "");
  return `${cleaned.slice(0, lastComma).replace(/[.,]/g, "")}.${cleaned.slice(lastComma + 1)}`;
}

// For antd InputNumber's `parser`. It is typed as returning the value type, but the component parses
// the returned text itself (its default parser returns text too), which keeps an emptied field empty.
export const moneyInputParser = (text: string | undefined) => normalizeMoneyInput(text) as unknown as number;

export function marginPct(revenue: number, profit: number): number {
  if (!revenue) return 0;
  return Math.round((profit / revenue) * 100);
}
