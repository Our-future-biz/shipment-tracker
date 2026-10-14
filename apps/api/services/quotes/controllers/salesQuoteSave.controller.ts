import { api } from "encore.dev/api";
import type { Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteSaveRequest {
  quoteNumber: string;
  /**
   * The whole document as edited. Status, validity, owner and history are not taken from it:
   * they are changed with their own endpoints, and keys of that kind in here are ignored.
   */
  data: Record<string, unknown>;
  /**
   * The dataVersion of the document the caller's copy is based on. The quote is written only
   * while it still has that version; otherwise the request fails with a conflict (HTTP 409)
   * and nothing is written.
   */
  expectedDataVersion: number & Min<1>;
}

interface SalesQuoteSaveResponse {
  quote: SalesQuoteItem;
}

export const salesQuoteSave = api(
  { expose: true, auth: true, method: "PATCH", path: "/sales-quotes/:quoteNumber" },
  async (req: SalesQuoteSaveRequest): Promise<SalesQuoteSaveResponse> => {
    const quote = await salesQuoteService.save(getAuthData()!, req.quoteNumber, req.data, req.expectedDataVersion);
    return { quote };
  },
);
