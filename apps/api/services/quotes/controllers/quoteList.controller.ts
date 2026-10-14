import { api } from "encore.dev/api";
import type { Max, Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { quoteService } from "../services/quote.service";
import type { QuotePage } from "../interfaces/interfaces";

interface QuoteListRequest {
  limit?: number & Min<1> & Max<1000>;
  offset?: number & Min<0>;
  sortDirection?: "asc" | "desc";
  /** Only the quotes made for this customer (the customer page's Quotes tab). */
  customerId?: string;
}

export const quoteList = api(
  { expose: true, auth: true, method: "GET", path: "/quotes" },
  async (req: QuoteListRequest): Promise<QuotePage> => {
    return quoteService.list(getAuthData()!.companyID, req);
  },
);
