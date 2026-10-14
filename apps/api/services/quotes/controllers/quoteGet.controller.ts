import { api } from "encore.dev/api";
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
    return { quote: await quoteService.get(req.quoteNumber, getAuthData()!.companyID) };
  },
);
