import { api, APIError } from "encore.dev/api";
import { quoteService } from "../services/quote.service";
import type { QuoteItem } from "../interfaces/interfaces";

interface QuoteGetRequest {
  quoteNumber: string;
}

interface QuoteGetResponse {
  quote: QuoteItem;
}

export const quoteGet = api(
  { expose: true, auth: false, method: "GET", path: "/quotes/:quoteNumber" },
  async (req: QuoteGetRequest): Promise<QuoteGetResponse> => {
    const quote = await quoteService.getByQuoteNumber(req.quoteNumber);
    if (!quote) {
      throw APIError.notFound("Quote not found");
    }
    return { quote: quote as unknown as QuoteItem };
  },
);
