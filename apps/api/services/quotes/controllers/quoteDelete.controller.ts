import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { quoteService } from "../services/quote.service";

interface QuoteDeleteRequest {
  quoteNumber: string;
}

interface QuoteDeleteResponse {
  ok: boolean;
}

export const quoteDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/quotes/:quoteNumber" },
  async (req: QuoteDeleteRequest): Promise<QuoteDeleteResponse> => {
    const companyId = getAuthData()!.companyID;
    const quote = await quoteService.getByQuoteNumber(req.quoteNumber, companyId);
    if (!quote) {
      throw APIError.notFound("Quote not found");
    }
    await quoteService.softDelete(quote.id, companyId);
    return { ok: true };
  },
);
