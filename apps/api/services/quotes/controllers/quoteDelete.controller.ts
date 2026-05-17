import { api, APIError } from "encore.dev/api";
import { quoteService } from "../services/quote.service";

interface QuoteDeleteRequest {
  quoteNumber: string;
}

interface QuoteDeleteResponse {
  ok: boolean;
}

export const quoteDelete = api(
  { expose: true, auth: false, method: "DELETE", path: "/quotes/:quoteNumber" },
  async (req: QuoteDeleteRequest): Promise<QuoteDeleteResponse> => {
    const quote = await quoteService.getByQuoteNumber(req.quoteNumber);
    if (!quote) {
      throw APIError.notFound("Quote not found");
    }
    await quoteService.softDelete(quote.id);
    return { ok: true };
  },
);
