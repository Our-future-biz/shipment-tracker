import { iso } from "../../../lib/db/serialize";
import type { QuoteRecord } from "../schemas/quote.schema";
import type { QuoteItem } from "../interfaces/interfaces";

export const toQuoteItem = (r: QuoteRecord): QuoteItem => ({
  id: r.id,
  quoteNumber: r.quoteNumber,
  data: r.data,
  terms: r.terms,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});
