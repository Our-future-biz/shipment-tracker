import { api } from "encore.dev/api";
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
  async ({ quoteNumber, ...changes }: QuoteUpdateRequest): Promise<QuoteUpdateResponse> => {
    return { quote: await quoteService.update(quoteNumber, getAuthData()!.companyID, changes) };
  },
);
