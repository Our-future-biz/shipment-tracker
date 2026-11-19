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
 * its reference - which is never used again - are kept. Only a Draft that never went out can
 * be: refused for everybody (failed precondition) while a shipment or trucking job names it,
 * once it is Ready to Send or later, for the revision of a Replaced quote and for the original
 * offer a variant (-2) or revision (-R1) follows on from - it stays as the record of what was
 * offered; refused for a
 * user who may not delete this quote (permission denied). What the signed-in user may do is on
 * every quote that is handed out: permissions.canDelete.
 */
export const salesQuoteDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/sales-quotes/:quoteNumber" },
  async (req: SalesQuoteDeleteRequest): Promise<SalesQuoteDeleteResponse> => {
    await salesQuoteService.delete(getAuthData()!, req.quoteNumber);
    return { ok: true };
  },
);
