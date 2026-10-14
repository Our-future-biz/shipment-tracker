import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { quoteService } from "../services/quote.service";
import type { QuoteItem } from "../interfaces/interfaces";

interface QuoteDuplicateRequest {
  baseRef: string & MinLen<1> & MaxLen<100>;
  data?: unknown;
}

interface QuoteDuplicateResponse {
  quoteNumber: string;
  quote: QuoteItem;
}

export const quoteDuplicate = api(
  { expose: true, auth: true, method: "POST", path: "/quote-duplicate" },
  async (req: QuoteDuplicateRequest): Promise<QuoteDuplicateResponse> => {
    return quoteService.duplicateSalesQuote(getAuthData()!.companyID, req.baseRef, req.data ?? {});
  },
);
