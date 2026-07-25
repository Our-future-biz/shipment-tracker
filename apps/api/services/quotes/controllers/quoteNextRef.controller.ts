import { api } from "encore.dev/api";
import { quoteService } from "../services/quote.service";

interface QuoteNextRefResponse {
  ref: string;
}

export const quoteNextRef = api(
  { expose: true, auth: false, method: "GET", path: "/quote-next-ref" },
  async (): Promise<QuoteNextRefResponse> => {
    const ref = await quoteService.nextSalesReference();
    return { ref };
  },
);
