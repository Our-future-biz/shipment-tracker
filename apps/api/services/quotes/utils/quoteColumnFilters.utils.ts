import { APIError } from "encore.dev/api";
import { escapeLike, foldDiacritics } from "./quoteSearch.utils";

// "Filter by column" on the Quotes list: rows of column + value, each kept by the quotes whose text
// in that column contains the value (case and diacritics aside) - or, on a column of fixed values,
// is it. The server filters, so the rows cover every page of the list, not only the one on screen.

/** The columns a filter can be set on (the list's column keys). */
export const QUOTE_FILTER_COLUMNS = [
  "reference",
  "customer",
  "origin",
  "destination",
  "validity",
  "shipment",
  "incoterm",
  "cargoReady",
  "commodity",
  "method",
  "shippingTerms",
  "sent",
] as const;
export type QuoteFilterColumn = (typeof QUOTE_FILTER_COLUMNS)[number];

/** Columns whose value is picked from a fixed set: the cell must be it. */
export const EXACT_FILTER_COLUMNS: readonly QuoteFilterColumn[] = ["incoterm"];

/** A column filter as the repository takes it: the value folded, and for a "contains" column escaped for LIKE. */
export interface QuoteColumnFilter {
  key: QuoteFilterColumn;
  value: string;
  exact: boolean;
  /** The value folded, not escaped: what another service is asked for (the shipments of a "shipment" filter). */
  text: string;
  /**
   * A "shipment" filter: the quotes named by a shipment whose job number contains the value (the
   * quote keeps only its first shipment's job number), as the shipments service answered.
   */
  references?: string[];
}

const MAX_FILTERS = 10;
const MAX_VALUE = 100;

const isColumn = (key: unknown): key is QuoteFilterColumn => typeof key === "string" && (QUOTE_FILTER_COLUMNS as readonly string[]).includes(key);

/**
 * The column filters of a list request (JSON: [{ "key": "customer", "value": "alza" }, ...]). Rows
 * without a value narrow nothing and are dropped; an unknown column or a request that is no such
 * list is refused.
 */
export function columnFiltersOf(json: string | undefined): QuoteColumnFilter[] {
  if (!json?.trim()) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    throw APIError.invalidArgument("columnFilters must be a JSON list of { key, value }");
  }
  if (!Array.isArray(rows)) throw APIError.invalidArgument("columnFilters must be a JSON list of { key, value }");
  const filters: QuoteColumnFilter[] = [];
  for (const row of rows) {
    const { key, value } = (row ?? {}) as { key?: unknown; value?: unknown };
    if (!isColumn(key)) throw APIError.invalidArgument(`"${String(key)}" is not a column a quote list can be filtered by`);
    if (typeof value !== "string") throw APIError.invalidArgument("A column filter's value is text");
    const folded = foldDiacritics(Array.from(value.trim()).slice(0, MAX_VALUE).join(""));
    if (!folded) continue;
    const exact = EXACT_FILTER_COLUMNS.includes(key);
    filters.push({ key, value: exact ? folded : escapeLike(folded), exact, text: folded });
  }
  if (filters.length > MAX_FILTERS) throw APIError.invalidArgument(`At most ${MAX_FILTERS} column filters`);
  return filters;
}
