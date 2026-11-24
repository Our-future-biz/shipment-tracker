import { salesQuoteRepository } from "../repositories/salesQuote.repository";

/**
 * What a quote another service links to is called now (the Loading Planner, before it saves a plan
 * linked to a quote, and when it opens one): the reference of the company's live quote found under
 * `reference` - with or without its Freight Mode letters - but only when that quote is the one with
 * `quoteId`. Null when there is no such live quote, and when the id and the reference name two
 * different quotes: a link is to one quote, and the browser that sent both is not taken at its word.
 */
export async function quoteLinkRef(companyId: string, quoteId: string, reference: string): Promise<string | null> {
  const ref = reference.trim();
  if (!ref) return null;
  const quote = await salesQuoteRepository.loadLive(companyId, ref);
  return quote && quote.id === quoteId ? quote.quoteNumber : null;
}
