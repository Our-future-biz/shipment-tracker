import { api } from "encore.dev/api";
import type { Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteReviseRequest {
  /** The Quoted, Feedback, Expired or Won quote to revise. */
  quoteNumber: string;
  /** The dataVersion the caller's copy is based on; a quote changed since is not revised (HTTP 409). */
  expectedDataVersion?: number & Min<1>;
}

interface SalesQuoteReviseResponse {
  /** The quote revised, now Replaced. */
  quote: SalesQuoteItem;
  /**
   * Its revision: the next -R1, -R2, ... with the same content, Revised, to be priced again and
   * sent. The revision of a Won quote stays Won and takes over the quote's shipments.
   */
  revision: SalesQuoteItem;
  /** Set when the shipments of a Won quote could not be moved to its revision: what to do by hand. */
  warning?: string;
}

export const salesQuoteRevise = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/revise" },
  async (req: SalesQuoteReviseRequest): Promise<SalesQuoteReviseResponse> => {
    return salesQuoteService.revise(getAuthData()!, req.quoteNumber, req.expectedDataVersion);
  },
);
