import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { SalesQuoteItem } from "../interfaces/interfaces";

interface SalesQuoteTransitionRequest {
  quoteNumber: string;
  /** The status to set. Expired is not one: a quote expires when its validity date has passed. */
  to: "draft" | "ready_to_send" | "quoted" | "feedback" | "revised" | "won" | "lost";
  comment?: string;
  /** To Quoted: "valid N days" from today (1-365), used only when the quote has no validity that still holds. */
  validityDays?: number;
  /** To Lost: "Category: reason". */
  lostReason?: string;
  /**
   * To Quoted: the Exchange sheet the sender saw (CZK per 1 unit, and its week). The rates the
   * quote converts with and does not store yet are stored from it together with the sending.
   */
  exchange?: { rates: Record<string, number>; week?: string };
  /**
   * The status the caller's screen showed - the effective one, so "expired" for a quote whose
   * validity has passed. When sent, the change is refused if the quote is in another by now.
   */
  expectedStatus?: string;
  /** The dataVersion the caller's copy is based on. When sent and no longer current: conflict (HTTP 409). */
  expectedDataVersion?: number;
}

interface SalesQuoteTransitionResponse {
  quote: SalesQuoteItem;
  /** False when the quote already had that status: nothing was written. */
  changed: boolean;
}

export const salesQuoteTransition = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/transition" },
  async (req: SalesQuoteTransitionRequest): Promise<SalesQuoteTransitionResponse> => {
    const { quoteNumber, ...request } = req;
    return salesQuoteService.transition(getAuthData()!, quoteNumber, request);
  },
);
