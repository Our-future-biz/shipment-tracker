import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { QuotePackageLine } from "../interfaces/interfaces";
import { quoteLinkRef } from "../services/quoteLinkRef.service";

interface QuoteLinkRefRequest {
  quoteId: string;
  /** The quote's reference as the caller holds it, with or without its Freight Mode letters. */
  reference: string & MaxLen<60>;
  /** Also the quote's package lines: the Loading Planner opening a plan linked to it judges the plan's cargo by them. */
  withCargo?: boolean;
}

interface QuoteLinkRefResponse {
  /** The quote's reference as it is now; null when the caller's company has no live quote with this id under it. */
  quoteNumber: string | null;
  /** Asked withCargo, for a live quote: its package lines, as its document holds them. */
  packages?: QuotePackageLine[];
}

// Internal only (the Loading Planner, before it saves a plan linked to a quote and when it opens
// one): whether the quote exists in the caller's company - found by its reference, and it must be
// the quote with this id - what it is called now, and if asked its cargo. Company from the caller's auth.
export const _internalQuoteLinkRef = api(
  { expose: false, auth: true, method: "POST", path: "/internal/quotes/link-ref" },
  async ({ quoteId, reference, withCargo }: QuoteLinkRefRequest): Promise<QuoteLinkRefResponse> => {
    return quoteLinkRef(getAuthData()!.companyID, quoteId, reference, withCargo === true);
  },
);
