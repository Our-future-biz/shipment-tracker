import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import { isPlainObject } from "../utils/quoteDocument.utils";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteSaveRequest {
  quoteNumber: string;
  /**
   * The whole document as edited. Status, validity, owner and history are not taken from it:
   * they are changed with their own endpoints, and keys of that kind in here are ignored.
   */
  data: unknown;
  /**
   * The dataVersion of the document the caller's copy is based on. The quote is written only
   * while it still has that version; otherwise the request fails with a conflict (HTTP 409)
   * and nothing is written.
   */
  expectedDataVersion: number;
}

interface SalesQuoteSaveResponse {
  quote: SalesQuoteItem;
}

export const salesQuoteSave = api(
  { expose: true, auth: true, method: "PATCH", path: "/sales-quotes/:quoteNumber" },
  async (req: SalesQuoteSaveRequest): Promise<SalesQuoteSaveResponse> => {
    if (!isPlainObject(req.data)) {
      throw APIError.invalidArgument("data must be an object");
    }
    const quote = await salesQuoteService.save(getAuthData()!, req.quoteNumber, req.data, req.expectedDataVersion);
    return { quote };
  },
);
