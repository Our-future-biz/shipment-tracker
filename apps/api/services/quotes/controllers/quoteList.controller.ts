import { api } from "encore.dev/api";
import { quoteService } from "../services/quote.service";
import type { QuoteItem } from "../interfaces/interfaces";

interface QuoteListRequest {
  limit?: number;
  offset?: number;
  sortDirection?: "asc" | "desc";
}

interface QuoteListResponse {
  pagination: {
    total: number;
    offset: number;
    limit: number;
  };
  data: QuoteItem[];
}

export const quoteList = api(
  { expose: true, auth: false, method: "GET", path: "/quotes" },
  async (req: QuoteListRequest): Promise<QuoteListResponse> => {
    return quoteService.list(req) as unknown as Promise<QuoteListResponse>;
  },
);
