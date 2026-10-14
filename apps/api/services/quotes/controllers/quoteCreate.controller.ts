import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { quoteService } from "../services/quote.service";
import type { QuoteItem } from "../interfaces/interfaces";

interface QuoteCreateRequest {
  quoteNumber: string & MinLen<1> & MaxLen<100>;
  data?: unknown;
  terms?: string;
}

interface QuoteCreateResponse {
  quote: QuoteItem;
}

export const quoteCreate = api(
  { expose: true, auth: true, method: "POST", path: "/quotes" },
  async (req: QuoteCreateRequest): Promise<QuoteCreateResponse> => {
    return { quote: await quoteService.create(getAuthData()!.companyID, req.quoteNumber, req.data ?? {}, req.terms) };
  },
);
