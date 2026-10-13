import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteOwnerRequest {
  quoteNumber: string;
  /** The id of the user who owns the quote from now on - one of the company's users - or null for nobody. */
  ownerUserId: string | null;
}

interface SalesQuoteOwnerResponse {
  quote: SalesQuoteItem;
  /** False when the quote already had that owner: nothing was written. */
  changed: boolean;
}

export const salesQuoteOwner = api(
  { expose: true, auth: true, method: "PUT", path: "/sales-quotes/:quoteNumber/owner" },
  async (req: SalesQuoteOwnerRequest): Promise<SalesQuoteOwnerResponse> => {
    return salesQuoteService.setOwner(getAuthData()!, req.quoteNumber, req.ownerUserId);
  },
);
