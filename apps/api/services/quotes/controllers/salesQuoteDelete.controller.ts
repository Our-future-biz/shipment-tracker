import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";

interface SalesQuoteDeleteRequest {
  quoteNumber: string;
}

interface SalesQuoteDeleteResponse {
  ok: boolean;
}

/**
 * Deletes a sales quote: it is gone from Sales for everybody, while its row, its history and
 * its reference - which is never used again - are kept. Refused for a user who may not delete
 * this quote (permission denied), and for everybody while a shipment is linked to it (failed
 * precondition, naming the shipment). What the signed-in user may do is on every quote that is
 * handed out: permissions.canDelete.
 */
export const salesQuoteDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/sales-quotes/:quoteNumber" },
  async (req: SalesQuoteDeleteRequest): Promise<SalesQuoteDeleteResponse> => {
    await salesQuoteService.delete(getAuthData()!, req.quoteNumber);
    return { ok: true };
  },
);
