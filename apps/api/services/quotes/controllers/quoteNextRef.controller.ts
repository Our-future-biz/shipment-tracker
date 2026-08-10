import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { quoteService } from "../services/quote.service";

interface QuoteNextRefResponse {
  ref: string;
}

export const quoteNextRef = api(
  { expose: true, auth: true, method: "GET", path: "/quote-next-ref" },
  async (): Promise<QuoteNextRefResponse> => {
    const ref = await quoteService.nextSalesReference(getAuthData()!.companyID);
    return { ref };
  },
);
