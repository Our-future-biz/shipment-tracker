import { api } from "encore.dev/api";
import type { MaxLen, Min, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteMarginApproveRequest {
  quoteNumber: string;
  reason: string & MinLen<3> & MaxLen<500>;
  /** The dataVersion the caller's copy is based on. No longer current: conflict (HTTP 409). */
  expectedDataVersion: number & Min<1>;
}

interface SalesQuoteMarginApproveResponse {
  quote: SalesQuoteItem;
}

// A manager approves a road margin below the Trucking floor: the current margin is stored with
// the approval, and the quote may be sent while its margin stays the same or better.
export const salesQuoteMarginApprove = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/margin-approval" },
  async (req: SalesQuoteMarginApproveRequest): Promise<SalesQuoteMarginApproveResponse> => {
    const quote = await salesQuoteService.approveMargin(getAuthData()!, req.quoteNumber, req.reason, req.expectedDataVersion);
    return { quote };
  },
);
