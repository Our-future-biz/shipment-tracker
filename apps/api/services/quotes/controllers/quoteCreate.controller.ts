import { api, APIError } from "encore.dev/api";
import { quoteService } from "../services/quote.service";
import type { QuoteItem } from "../interfaces/interfaces";

interface QuoteCreateRequest {
  quoteNumber: string;
  data?: unknown;
  terms?: string;
}

interface QuoteCreateResponse {
  quote: QuoteItem;
}

export const quoteCreate = api(
  { expose: true, auth: false, method: "POST", path: "/quotes" },
  async (req: QuoteCreateRequest): Promise<QuoteCreateResponse> => {
    if (!req.quoteNumber) {
      throw APIError.invalidArgument("quoteNumber is required");
    }
    const quote = await quoteService.create(req.quoteNumber, req.data ?? {}, req.terms);
    return { quote: quote as unknown as QuoteItem };
  },
);
