import { withCustomerUnit } from "@/app/sales/_lib/quoteCustomer";
import { cargoReadyDay, stripProtected } from "@/app/sales/_lib/salesQuote";
import { DIRECTIONS, INCOTERMS, SERVICE_TYPES } from "@/app/sales/_lib/types";
import type { PROTECTED_KEYS, SalesQuoteData } from "@/app/sales/_lib/types";
import { toIsoDate, type ExtractedField } from "./extraction";

// Reading a customer's request into a Sales quote: which labels of the reader
// (QUOTE_FIELDS in apps/api/services/extraction/lib/fields.ts) fill which keys of the quote, what
// the review shows, and what a write sends. No request is made here.

// The keys of a quote a reading may fill. A key only the server writes, the link to the Customer
// Database or anything of the pricing does not compile in the table below.
type ReadingKey = Exclude<
  keyof SalesQuoteData,
  (typeof PROTECTED_KEYS)[number] | "customerId" | "customerLabel" | "buyingLines" | "sellingLines" | "currency" | "rates"
>;
type KeyOf<V> = { [K in ReadingKey]-?: NonNullable<SalesQuoteData[K]> extends V ? K : never }[ReadingKey];

type QuoteReadingField =
  | { label: string; key: KeyOf<string>; kind: "text" | "date" }
  | { label: string; key: KeyOf<string>; kind: "option"; options: readonly string[] }
  | { label: string; key: KeyOf<number>; kind: "number" };

// In the order of the quote page, under its labels. An API test reads these rows as text
// (quoteFields.test.ts), so each stays on one line in this shape.
export const QUOTE_READING_FIELDS: readonly QuoteReadingField[] = [
  { label: "Customer", key: "customerName", kind: "text" },
  { label: "Contact person", key: "customerContact", kind: "text" },
  { label: "Email", key: "customerEmail", kind: "text" },
  { label: "Phone", key: "customerPhone", kind: "text" },
  { label: "Trade Direction", key: "direction", kind: "option", options: DIRECTIONS },
  { label: "Freight Mode", key: "serviceType", kind: "option", options: SERVICE_TYPES },
  { label: "Incoterm", key: "incoterm", kind: "option", options: INCOTERMS },
  { label: "Cargo Readiness Date", key: "readyDate", kind: "date" },
  { label: "Origin", key: "origin", kind: "text" },
  { label: "Pickup", key: "pickup", kind: "text" },
  { label: "Destination", key: "destination", kind: "text" },
  { label: "Delivery", key: "delivery", kind: "text" },
  { label: "Cargo Description", key: "commodity", kind: "text" },
  { label: "Gross weight (kg)", key: "weight", kind: "number" },
  { label: "Volume (cbm)", key: "cbm", kind: "number" },
];

// The person a quote goes to. Their rows are held back when the document names another company
// than the quote is for: one customer's e-mail under another's name would send the quotation to
// the wrong address.
const CONTACT_KEYS: readonly string[] = ["customerContact", "customerEmail", "customerPhone"];

// As in quoteCustomer.ts: case and spaces around a name do not make it another company's.
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What the quote holds for a field, written the way a review row writes it; "" when it holds nothing. */
export function quoteExistingValue(data: SalesQuoteData, field: QuoteReadingField): string {
  // A readiness that is no date (older imports left such texts) counts as empty, as on the quote page.
  if (field.kind === "date") return cargoReadyDay(data);
  const value = data[field.key];
  return value ? String(value).trim() : "";
}

export interface QuoteReview {
  fields: ExtractedField[];
  /** What the review leaves out or holds back, one sentence each. */
  notes: string[];
  /** How many values the document states that the quote already holds. */
  alreadyThere: number;
}

export const EMPTY_QUOTE_REVIEW: QuoteReview = { fields: [], notes: [], alreadyThere: 0 };

/**
 * The rows to review: what was read, against the quote it goes into (null for a new quote).
 * A value that differs from the quote is a conflict and starts unticked. Left out: what the quote
 * already holds, the customer of a quote that has one, and weight and volume of a quote with
 * package lines. `previous` are the rows on screen when the quote had to be read again: their
 * corrections stay, and a tick stays unless the row now clashes with a value that changed or is a
 * contact detail held back for another customer.
 */
export function quoteReviewRows(extracted: Record<string, string>, quote: SalesQuoteData | null, previous: ExtractedField[] = []): QuoteReview {
  const data = quote ?? {};
  const customer = (data.customerName ?? "").trim();
  const hasCustomer = !!(data.customerId || customer);
  // The name as the user corrected it in the review, else as read.
  const named = (previous.find((row) => row.column === "Customer")?.extractedValue.trim() || (extracted.Customer ?? "")).trim();
  const otherCustomer = hasCustomer && !!named && !sameName(named, customer);
  // With package lines the quote's weight and volume are those of the lines (computeCargo).
  const hasLines = (data.packages?.length ?? 0) > 0;

  const review: QuoteReview = { fields: [], notes: [], alreadyThere: 0 };
  let totalsLeftOut = false;
  let contactsHeld = false;
  for (const field of QUOTE_READING_FIELDS) {
    const before = previous.find((row) => row.column === field.label);
    const extractedValue = (before?.extractedValue ?? extracted[field.label] ?? "").trim();
    if (!extractedValue) continue;
    // A document never replaces the customer a quote already has.
    if (field.key === "customerName" && hasCustomer) {
      if (!otherCustomer) review.alreadyThere += 1;
      continue;
    }
    if (field.kind === "number" && hasLines) {
      totalsLeftOut = true;
      continue;
    }
    const existingValue = quoteExistingValue(data, field);
    if (existingValue === extractedValue) {
      review.alreadyThere += 1;
      continue;
    }
    const hasConflict = existingValue !== "";
    const held = otherCustomer && CONTACT_KEYS.includes(field.key);
    if (held) contactsHeld = true;
    const kept = before ? (before.existingValue === existingValue ? before.approved : before.approved && !hasConflict) : !hasConflict;
    // A held row is unticked on every build: after a re-read the quote may be for another customer.
    review.fields.push({ column: field.label, extractedValue, existingValue, hasConflict, approved: kept && !held });
  }
  if (otherCustomer) {
    // No name ends a sentence here: "s.r.o." followed by a full stop would read as a typo.
    const names = `The document names ${named}, while this quote is for ${customer || "another customer"} - the customer is not changed here`;
    review.notes.push(
      contactsHeld ? `${names}, and the contact details from the document are not ticked. Tick them only if they belong to this customer.` : `${names}.`,
    );
  }
  if (totalsLeftOut) {
    review.notes.push("This quote lists its packages, so its weight and volume come from them. The totals in the document are not written.");
  }
  return review;
}

// What a field takes, to finish "<Label> must be …".
const expected = (field: QuoteReadingField): string =>
  field.kind === "option" ? `one of ${field.options.join(", ")}` : field.kind === "date" ? "a full date, e.g. 20.10.2026" : "a plain number, e.g. 2400 or 2400.5";

// The value a row's text stands for, in the form the quote stores it; undefined when the text does not fit.
function readValue(field: QuoteReadingField, text: string): string | number | undefined {
  const value = text.trim();
  if (field.kind === "option") return field.options.find((option) => option.toLowerCase() === value.toLowerCase());
  if (field.kind === "date") return toIsoDate(value) || undefined;
  // Digits with a dot only: a comma could be a decimal mark or group thousands.
  if (field.kind === "number") return /^\d+(\.\d+)?$/.test(value) && Number(value) > 0 ? Number(value) : undefined;
  return value || undefined;
}

/**
 * What the ticked rows change of a quote. A ticked value that does not fit its field is named in
 * `problems` and nothing may be written then; empty and unticked rows change nothing.
 */
export function quoteReadingPatch(fields: ExtractedField[]): { patch: Partial<SalesQuoteData>; problems: string[] } {
  const patch: Partial<SalesQuoteData> = {};
  const problems: string[] = [];
  for (const field of QUOTE_READING_FIELDS) {
    const row = fields.find((f) => f.column === field.label);
    if (!row?.approved || !row.extractedValue.trim()) continue;
    const value = readValue(field, row.extractedValue);
    if (value === undefined) problems.push(`${field.label} must be ${expected(field)}`);
    // The table ties every key to the kind of value it takes.
    else Object.assign(patch, { [field.key]: value });
  }
  return { patch, problems };
}

/**
 * The quote's document after a reading: the document as stored with the patch applied the way the
 * quote page applies any change (`set` in QuoteWorkflow.tsx) - without the keys only the server
 * writes, and safe for the quote's customer. For a new quote `quote` is {}.
 */
export function quoteAfterReading(quote: SalesQuoteData, patch: Partial<SalesQuoteData>): SalesQuoteData {
  return { ...quote, ...withCustomerUnit(quote, stripProtected(patch)) };
}
