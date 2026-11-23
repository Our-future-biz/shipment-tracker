import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";

interface QuoteLinkRefRequest {
  quoteId: string;
  /** The quote's reference as the caller holds it, with or without its Freight Mode letters. */
  reference: string & MaxLen<60>;
}

interface QuoteLinkRefResponse {
  /** The quote's reference as it is now; null when the caller's company has no live quote with this id under it. */
  quoteNumber: string | null;
}

// Internal only (the Loading Planner, before it saves a plan linked to a quote): whether the quote
// exists in the caller's company - found by its reference, and it must be the quote with this id -
// and what it is called now. Company from the caller's auth.
export const _internalQuoteLinkRef = api(
  { expose: false, auth: true, method: "POST", path: "/internal/quotes/link-ref" },
  async ({ quoteId, reference }: QuoteLinkRefRequest): Promise<QuoteLinkRefResponse> => {
    const quote = await salesQuoteRepository.loadLive(getAuthData()!.companyID, reference.trim());
    return { quoteNumber: quote && quote.id === quoteId ? quote.quoteNumber : null };
  },
);
