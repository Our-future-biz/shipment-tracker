import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteValidityRequest {
  quoteNumber: string;
  /** The last day the quote is valid (YYYY-MM-DD), or null for none. */
  validUntil: string | null;
}

interface SalesQuoteValidityResponse {
  quote: SalesQuoteItem;
}

export const salesQuoteValidity = api(
  { expose: true, auth: true, method: "PUT", path: "/sales-quotes/:quoteNumber/validity" },
  async (req: SalesQuoteValidityRequest): Promise<SalesQuoteValidityResponse> => {
    const quote = await salesQuoteService.setValidity(getAuthData()!, req.quoteNumber, req.validUntil);
    return { quote };
  },
);
