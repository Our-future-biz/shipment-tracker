import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mainSearchInput } from "../../../lib/mainSearch";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SearchQuotesRequest, SearchQuotesResponse } from "../interfaces/interfaces";

/**
 * The main search (the top bar) in Sales: the newest sales quotes the Quotes list's search finds
 * by these words (reference, customer, service type, direction, origin, destination, commodity,
 * incoterm, owner, job number, status), and how many match in all. Fewer than 2 characters give
 * nothing.
 */
export const searchQuotes = api(
  { expose: true, auth: true, method: "GET", path: "/search/quotes" },
  async (req: SearchQuotesRequest): Promise<SearchQuotesResponse> => {
    const input = mainSearchInput(req.q, req.limit);
    if (!input) return { items: [], total: 0 };
    return salesQuoteService.searchMain(getAuthData()!, input.q, input.limit);
  },
);
