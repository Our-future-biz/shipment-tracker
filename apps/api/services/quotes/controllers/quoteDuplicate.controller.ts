import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { quoteService } from "../services/quote.service";
import type { QuoteItem } from "../interfaces/interfaces";

interface QuoteDuplicateRequest {
  baseRef: string;
  data?: unknown;
}

interface QuoteDuplicateResponse {
  quoteNumber: string;
  quote: QuoteItem;
}

export const quoteDuplicate = api(
  { expose: true, auth: true, method: "POST", path: "/quote-duplicate" },
  async (req: QuoteDuplicateRequest): Promise<QuoteDuplicateResponse> => {
    if (!req.baseRef) {
      throw APIError.invalidArgument("baseRef is required");
    }
    const { quoteNumber, quote } = await quoteService.duplicateSalesQuote(getAuthData()!.companyID, req.baseRef, req.data ?? {});
    return { quoteNumber, quote: quote as unknown as QuoteItem };
  },
);
