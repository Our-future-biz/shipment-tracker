import type { QuotePackageLine } from "../interfaces/interfaces";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";
import { isPlainObject } from "../utils/quoteDocument.utils";

/** What the Loading Planner is told about a quote a plan links to. */
export interface QuoteLink {
  /** The quote's reference as it is now; null when there is no such live quote. */
  quoteNumber: string | null;
  /** Asked with the cargo, of a live quote: its package lines, as its document holds them. */
  packages?: QuotePackageLine[];
}

// A figure of a package line as the document may hold it: a number, or a number typed as text.
const figure = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** The package lines of a quote's document, each with the fields a package line has and nothing else. */
function packageLinesOf(data: unknown): QuotePackageLine[] {
  const packages = isPlainObject(data) && Array.isArray(data.packages) ? data.packages : [];
  return packages.filter(isPlainObject).map((p) => ({
    qty: figure(p.qty),
    type: typeof p.type === "string" ? p.type : undefined,
    length: figure(p.length),
    width: figure(p.width),
    height: figure(p.height),
    weight: figure(p.weight),
    stackable: typeof p.stackable === "boolean" ? p.stackable : undefined,
  }));
}

/**
 * What a quote another service links to is called now (the Loading Planner, before it saves a plan
 * linked to a quote, and when it opens one): the reference of the company's live quote found under
 * `reference` - with or without its Freight Mode letters - but only when that quote is the one with
 * `quoteId`. Null when there is no such live quote, and when the id and the reference name two
 * different quotes: a link is to one quote, and the browser that sent both is not taken at its word.
 * `withCargo` (a plan being opened): the quote's package lines too, to judge the plan's cargo by.
 */
export async function quoteLinkRef(companyId: string, quoteId: string, reference: string, withCargo = false): Promise<QuoteLink> {
  const ref = reference.trim();
  if (!ref) return { quoteNumber: null };
  const quote = await salesQuoteRepository.loadLive(companyId, ref);
  if (!quote || quote.id !== quoteId) return { quoteNumber: null };
  return withCargo ? { quoteNumber: quote.quoteNumber, packages: packageLinesOf(quote.data) } : { quoteNumber: quote.quoteNumber };
}
