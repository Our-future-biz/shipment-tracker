import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteDuplicateRequest {
  /** The quote to make a variant of; the variant gets its reference with the next free -2, -3, ... */
  quoteNumber: string;
  /**
   * The fields the variant starts with. Reference, status, owner and history are assigned by
   * the server; keys of that kind in here are ignored.
   */
  data?: Record<string, unknown>;
}

interface SalesQuoteDuplicateResponse {
  quote: SalesQuoteItem;
}

export const salesQuoteDuplicate = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/duplicate" },
  async (req: SalesQuoteDuplicateRequest): Promise<SalesQuoteDuplicateResponse> => {
    const quote = await salesQuoteService.duplicate(getAuthData()!, req.quoteNumber, req.data ?? {});
    return { quote };
  },
);
