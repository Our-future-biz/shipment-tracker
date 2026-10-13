import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import { isPlainObject } from "../utils/quoteDocument.utils";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteCreateRequest {
  /**
   * The fields the quote starts with. Reference, status, owner and history are assigned by the
   * server; keys of that kind in here are ignored.
   */
  data?: unknown;
}

interface SalesQuoteCreateResponse {
  quote: SalesQuoteItem;
}

export const salesQuoteCreate = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes" },
  async (req: SalesQuoteCreateRequest): Promise<SalesQuoteCreateResponse> => {
    if (req.data !== undefined && !isPlainObject(req.data)) {
      throw APIError.invalidArgument("data must be an object");
    }
    const quote = await salesQuoteService.create(getAuthData()!, req.data ?? {});
    return { quote };
  },
);
