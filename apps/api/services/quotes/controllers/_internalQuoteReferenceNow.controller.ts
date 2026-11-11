import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";

interface QuoteReferenceNowRequest {
  /** A quote's reference as a copy holds it, with or without its Freight Mode letters. */
  reference: string & MaxLen<60>;
}

interface QuoteReferenceNowResponse {
  /** The live quote's reference now; null when there is no live quote under it. */
  quoteNumber: string | null;
}

// Internal only (the quote-renamed subscribers): what a copy of a quote's reference should say now. An
// event is only the signal to ask: one delivered late or out of order never sets an older reference.
// Company from the caller's auth.
export const _internalQuoteReferenceNow = api(
  { expose: false, auth: true, method: "POST", path: "/internal/quotes/reference-now" },
  async ({ reference }: QuoteReferenceNowRequest): Promise<QuoteReferenceNowResponse> => {
    const quote = await salesQuoteRepository.loadLive(getAuthData()!.companyID, reference.trim());
    return { quoteNumber: quote?.quoteNumber ?? null };
  },
);
