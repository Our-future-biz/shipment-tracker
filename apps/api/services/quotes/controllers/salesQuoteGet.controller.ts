import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteGetRequest {
  quoteNumber: string;
}

interface SalesQuoteGetResponse {
  quote: SalesQuoteItem;
}

export const salesQuoteGet = api(
  { expose: true, auth: true, method: "GET", path: "/sales-quotes/:quoteNumber" },
  async (req: SalesQuoteGetRequest): Promise<SalesQuoteGetResponse> => {
    const quote = await salesQuoteService.get(getAuthData()!, req.quoteNumber);
    return { quote };
  },
);
