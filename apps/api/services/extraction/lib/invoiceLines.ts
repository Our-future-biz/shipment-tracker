import type { ExtractionResult, InvoiceLineRead } from "../interfaces/interfaces";

// The charge rows of an invoice, as the model reads them. Only what can be used comes through: a row
// without a readable amount is left out, and the screens check the rows against the invoice's total.

/**
 * An amount as a plain decimal to the cent ("1177.20"), read from how invoices print it ("1,177.20",
 * "1.177,20", "1 177,20", "40.0858"); null when it is none. A "." or "," separates thousands only
 * when exactly three digits follow it and the other separator is in the number too, or it comes
 * more than once ("1,177,200"), or it is a lone "," ("1,250": the reader is asked for a "." decimal
 * point, so a lone "," is an invoice's thousands copied as printed); any other is the decimal point.
 * With both, the last one always is. So "399.600" is 399.60, "40.0858" is 40.09 and "1,250" is 1250.00.
 */
export function plainAmount(value: unknown): string | null {
  const text = String(value ?? "").replace(/[\s\u00a0\u202f]/g, "");
  const match = /^(-?)([\d.,]+)$/.exec(text);
  if (!match) return null;
  const [, sign, body] = match as unknown as [string, string, string];
  const both = body.includes(".") && body.includes(",");
  const separators = [...body].flatMap((ch, i) => (ch === "." || ch === "," ? [i] : []));
  const last = separators[separators.length - 1];
  let decimalAt = -1;
  for (const i of separators) {
    const ch = body[i]!;
    const repeats = body.indexOf(ch) !== body.lastIndexOf(ch);
    const thousands = !(both && i === last) && /^\d{3}(?!\d)/.test(body.slice(i + 1)) && (both || repeats || ch === ",");
    // A second decimal point, or thousands after the decimals, is no number.
    if (decimalAt >= 0) return null;
    if (!thousands) decimalAt = i;
  }
  const digits = (from: number, to?: number) => body.slice(from, to).replace(/[.,]/g, "");
  const whole = decimalAt < 0 ? digits(0) : digits(0, decimalAt);
  const fraction = decimalAt < 0 ? "" : body.slice(decimalAt + 1);
  if (!/^\d*$/.test(fraction) || !(whole + fraction) || whole.length > 12) return null;
  // Rounded half up on the digits themselves, so 0.005 is 0.01 whatever binary makes of it.
  const cents = Number(`${whole || "0"}${fraction.padEnd(2, "0").slice(0, 2)}`) + (Number(fraction[2] ?? "0") >= 5 ? 1 : 0);
  if (cents === 0) return null;
  const padded = String(cents).padStart(3, "0");
  return `${sign}${padded.slice(0, -2)}.${padded.slice(-2)}`;
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
