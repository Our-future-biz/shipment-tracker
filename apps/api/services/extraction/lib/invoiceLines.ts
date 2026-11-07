import type { ExtractionResult, InvoiceLineRead } from "../interfaces/interfaces";

// The charge rows of an invoice, as the model reads them. Only what can be used comes through: a row
// without a readable amount is left out, and the screens check the rows against the invoice's total.

/** An amount as a plain decimal ("1177.20"), read from how invoices print it ("1,177.20", "1 177,20"); null when it is none. */
export function plainAmount(value: unknown): string | null {
  const text = String(value ?? "").replace(/[\s ]/g, "");
  if (!text) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  // The last of the two separators, followed by one or two digits, marks the decimals.
  const decimalAt = Math.max(lastDot, lastComma);
  const hasDecimals = decimalAt >= 0 && text.length - decimalAt - 1 <= 2;
  const whole = (hasDecimals ? text.slice(0, decimalAt) : text).replace(/[.,]/g, "");
  const plain = hasDecimals ? `${whole}.${text.slice(decimalAt + 1)}` : whole;
  return /^-?\d+(\.\d{1,2})?$/.test(plain) && Number(plain) !== 0 ? Number(plain).toFixed(2) : null;
}

const textOf = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** The rows of a reply: objects with an amount, each with its B/L ("" when it names none). */
export function invoiceLinesOf(raw: unknown): InvoiceLineRead[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row): InvoiceLineRead[] => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const amount = plainAmount(r.amount);
    if (amount === null) return [];
    return [{ bl: textOf(r.bl).toUpperCase(), item: textOf(r.item), amount, currency: textOf(r.currency).toUpperCase(), serviceType: textOf(r.service_type) }];
  });
}

/** The reading with its rows apart from its fields (filterExtracted keeps them as JSON under "lines"). */
export function withInvoiceLines(result: ExtractionResult): ExtractionResult {
  const { lines, ...extracted } = result.extracted;
  let rows: unknown = [];
  try {
    rows = lines ? JSON.parse(lines) : [];
  } catch {
    rows = [];
  }
  return { ...result, extracted, fieldCount: Object.keys(extracted).length, invoiceLines: invoiceLinesOf(rows) };
}
