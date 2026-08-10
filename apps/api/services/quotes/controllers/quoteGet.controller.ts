import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { quoteService } from "../services/quote.service";
import type { QuoteItem } from "../interfaces/interfaces";

interface QuoteGetRequest {
  quoteNumber: string;
}

interface QuoteGetResponse {
  quote: QuoteItem;
}

export const quoteGet = api(
  { expose: true, auth: true, method: "GET", path: "/quotes/:quoteNumber" },
  async (req: QuoteGetRequest): Promise<QuoteGetResponse> => {
    const quote = await quoteService.getByQuoteNumber(req.quoteNumber, getAuthData()!.companyID);
    if (!quote) {
      throw APIError.notFound("Quote not found");
    }
    return { quote: quote as unknown as QuoteItem };
  },
);
