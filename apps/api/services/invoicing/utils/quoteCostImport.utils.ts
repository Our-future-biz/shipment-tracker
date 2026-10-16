// The ONE mapping from the cost lines of a sales quote (data.buyingLines, data.sellingLines) to
// the rows of a shipment's Costs Breakdown: one row per line, in the quote's order, each in the
// currency of its line - nothing is added up and nothing converted. The document comes from
// browsers, so nothing about its shape is taken for granted. Pure, so the mapping has its test.

import { toChargeCode } from "../../../lib/chargeCodes";

/** A buying row of Costs Breakdown, as a quote's buying line fills it. */
export interface QuoteBuyingRow {
  category: string;
  description: string;
  vendor: string;
  estQty: string;
  estAmount: string | null;
  estCurrency: string;
  realQty: string;
  realCurrency: string;
  unit: string;
}

/** A selling row of Costs Breakdown, as a quote's selling line fills it. */
export interface QuoteSellingRow {
  category: string;
  description: string;
  customer: string;
  qty: string;
  amount: string | null;
  currency: string;
  invoice: boolean;
}

// A quote line without a unit price is one charge: its amount is the whole of it.
const ONE = "1";

// An amount column is numeric(14, 2): fourteen digits when counted in cents.
const CENTS_LIMIT = 1e14;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

// An amount typed as text, with a point as the decimal mark. Amounts are typed with a decimal
// comma ("1250,50") but shown with comma thousands ("1,250"): a comma is the decimal mark when it
// follows a point, or when it is the only comma and the text cannot be a thousands figure. The
// same reading as normalizeMoneyInput in the web (apps/web/src/lib/money.ts).
function withDecimalPoint(typed: string): string {
  const cleaned = typed.replace(/[^\d.,-]+/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  if (lastComma === -1) return cleaned;
  const lastDot = cleaned.lastIndexOf(".");
  const thousands = /^-?[1-9]\d{0,2},\d{3}$/.test(cleaned);
  const commaIsDecimal = lastDot === -1 ? cleaned.indexOf(",") === lastComma && !thousands : lastComma > lastDot;
  if (!commaIsDecimal) return cleaned.replace(/,/g, "");
  return `${cleaned.slice(0, lastComma).replace(/[.,]/g, "")}.${cleaned.slice(lastComma + 1)}`;
}

// The amount of a line in whole cents, or null when it holds none the amount column can take.
// The editor stores a number; a document older code or an import wrote may hold typed text.
function centsOf(value: unknown): number | null {
  const typed = withDecimalPoint(text(value));
  // Text without a digit is no amount; Number("") would make it 0.
  const amount = typeof value === "number" ? value : /\d/.test(typed) ? Number(typed) : NaN;
  const cents = Math.round(amount * 100);
  return Number.isFinite(cents) && Math.abs(cents) < CENTS_LIMIT ? cents : null;
}

interface QuoteLine {
  category: string;
  description: string;
  supplier: string;
  /** the quantity of the row: the line's own with its unit price, else 1 */
  qty: string;
  unit: string;
  /** the price of one `qty`: the unit price, or the whole line's amount when the qty is 1 */
  amount: string | null;
  currency: string;
}

const toAmount = (cents: number | null) => (cents === null ? null : (cents / 100).toFixed(2));

/** A line priced from a trucking tariff (tariffRef "trucking:…"): Trucking pushes its own rows for it. */
const isTruckingLine = (line: Record<string, unknown>) => typeof line.tariffRef === "string" && line.tariffRef.startsWith("trucking:");

// The lines of one side that say something. A line nobody filled in - the editor adds new lines
// with a type and the amount 0 - has no amount, no description and no supplier, and is left out.
function linesOf(value: unknown, quoteCurrency: string, skipTrucking: boolean): QuoteLine[] {
  if (!Array.isArray(value)) return [];
  const lines: QuoteLine[] = [];
  for (const line of value) {
    if (!isPlainObject(line)) continue;
    if (skipTrucking && isTruckingLine(line)) continue;
    const cents = centsOf(line.amount);
    const description = text(line.description);
    const supplier = text(line.supplier);
    if (!cents && !description && !supplier) continue;
    // A line priced per unit (a tariff: 420 km at 1.15) is copied as its quantity and unit price;
    // the amount alone is the whole charge, counted once. Only when the two (each kept to 2
    // decimals) still give the line's amount: a 12.5 % surcharge kept as 0.13 × base would not.
    const qtyCents = centsOf(line.qty);
    const unitPriceCents = centsOf(line.unitPrice);
    const perUnit =
      qtyCents !== null && qtyCents > 0 && unitPriceCents !== null && cents !== null && Math.round((qtyCents * unitPriceCents) / 100) === cents;
    lines.push({
      // Stored as its charge code: the code the editor keeps, else the type (a label) as its code.
      category: toChargeCode(text(line.chargeCode) || text(line.type)),
      description,
      supplier,
      qty: perUnit ? toAmount(qtyCents)! : ONE,
      unit: text(line.unit),
      amount: perUnit ? toAmount(unitPriceCents) : toAmount(cents),
      // A line without a currency of its own is in the quote's.
      currency: text(line.currency) || quoteCurrency,
    });
  }
  return lines;
}

/**
 * The Costs Breakdown rows a quote's document gives: a buying row per buying line (estimate =
 * the line's amount, real cost still open but in the same currency, vendor = the supplier) and a
 * selling row per selling line (charged to the quote's customer, ticked for invoicing).
 * `skipTrucking`: lines priced from a trucking tariff are left out (the job has a Trucking
 * consignment, whose rows are Trucking's own).
 */
export function quoteLinesToCostRows(data: unknown, opts: { skipTrucking?: boolean } = {}): { buying: QuoteBuyingRow[]; selling: QuoteSellingRow[] } {
  const doc = isPlainObject(data) ? data : {};
  // A quote whose currency was never changed stores none and is in EUR.
  const quoteCurrency = text(doc.currency) || "EUR";
  const customer = text(doc.customerName);
  return {
    buying: linesOf(doc.buyingLines, quoteCurrency, opts.skipTrucking === true).map((line) => ({
      category: line.category,
      description: line.description,
      vendor: line.supplier,
      estQty: line.qty,
      estAmount: line.amount,
      estCurrency: line.currency,
      realQty: line.qty,
      realCurrency: line.currency,
      unit: line.unit,
    })),
    selling: linesOf(doc.sellingLines, quoteCurrency, opts.skipTrucking === true).map((line) => ({
      category: line.category,
      description: line.description,
      customer,
      qty: line.qty,
      amount: line.amount,
      currency: line.currency,
      invoice: true,
    })),
  };
}
