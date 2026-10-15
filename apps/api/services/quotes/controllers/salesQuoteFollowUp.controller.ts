import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteFollowUpRequest {
  quoteNumber: string;
  /** What was said or agreed, for the quote's history; at most 2000 characters. */
  note?: string & MaxLen<8000>;
}

interface SalesQuoteFollowUpResponse {
  quote: SalesQuoteItem;
}

/**
 * Records that the customer was contacted about a quote that is with them (Quoted or Feedback,
 * not expired): the follow-up flag goes off for three days and the history gets a line with who
 * and when. Refused for a quote in any other status.
 */
export const salesQuoteFollowUp = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/follow-up" },
  async (req: SalesQuoteFollowUpRequest): Promise<SalesQuoteFollowUpResponse> => {
    const quote = await salesQuoteService.followUp(getAuthData()!, req.quoteNumber, req.note);
    return { quote };
  },
);
