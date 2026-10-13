// Customs invoice amounts: parsing what people type, formatting, and totals per currency.

export interface CustomsInvoiceLine {
  category: string;
  currency: string;
  value: number;
}

export const fmt = (n: number) => n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * An amount as typed — "1250.50", "1 250,50", "1,250.50", "1.250,50" — as a plain decimal
 * ("1250.50"); "" when blank, null when it isn't an amount with at most 2 decimal places.
 * With both separators, the last one is the decimal point; a lone comma is a decimal comma.
 */
export function parseAmount(text: string): string | null {
  let t = text.replace(/\s/g, "");
  if (t === "") return "";
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    t = t.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    t = t.replace(",", ".");
  }
  return /^-?\d{1,12}(\.\d{1,2})?$/.test(t) ? t : null;
}

// The lines add up per currency, in the order the currencies first appear.
export function totalsByCurrency(lines: CustomsInvoiceLine[]): [string, number][] {
  const sums = new Map<string, number>();
  for (const l of lines) sums.set(l.currency, (sums.get(l.currency) ?? 0) + l.value);
  return [...sums.entries()];
}
