import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { quoteService } from "../services/quote.service";
import type { QuoteItem } from "../interfaces/interfaces";

interface QuoteUpdateRequest {
  quoteNumber: string;
  data?: unknown;
  terms?: string;
}

interface QuoteUpdateResponse {
  quote: QuoteItem;
}

export const quoteUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/quotes/:quoteNumber" },
  async (req: QuoteUpdateRequest): Promise<QuoteUpdateResponse> => {
    const companyId = getAuthData()!.companyID;
    let quote = await quoteService.getByQuoteNumber(req.quoteNumber, companyId);
    if (!quote) {
      throw APIError.notFound("Quote not found");
    }
    if (req.data !== undefined) {
      quote = (await quoteService.updateData(req.quoteNumber, companyId, req.data))!;
    }
    if (req.terms !== undefined) {
      quote = (await quoteService.updateTerms(quote.id, companyId, req.terms))!;
    }
    return { quote: quote as unknown as QuoteItem };
  },
);
