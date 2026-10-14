import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteCreateRequest {
  /**
   * The fields the quote starts with. Reference, status, owner and history are assigned by the
   * server; keys of that kind in here are ignored.
   */
  data?: Record<string, unknown>;
}

interface SalesQuoteCreateResponse {
  quote: SalesQuoteItem;
}

export const salesQuoteCreate = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes" },
  async (req: SalesQuoteCreateRequest): Promise<SalesQuoteCreateResponse> => {
    const quote = await salesQuoteService.create(getAuthData()!, req.data ?? {});
    return { quote };
  },
);
