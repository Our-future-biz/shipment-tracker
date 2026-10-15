import { api } from "encore.dev/api";
import type { Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { QuoteRoadInput, SalesQuoteItem } from "../interfaces/interfaces";
import type { RateLevelResult, ServiceLevelCode } from "../../trucking/interfaces/interfaces";

interface SalesQuoteRoadPriceRequest {
  quoteNumber: string;
  /** The road transport as entered; stored on the quote as `road`. */
  road: QuoteRoadInput;
  serviceLevel: ServiceLevelCode;
  /** The haulier to buy from; null = the first candidate (preferred lane, then cheapest). */
  haulierCustomerId: string | null;
  /** The dataVersion the caller's copy is based on. No longer current: conflict (HTTP 409). */
  expectedDataVersion: number & Min<1>;
}

interface SalesQuoteRoadPriceResponse {
  quote: SalesQuoteItem;
  /** The rating of the chosen level the quote was priced with. */
  result: RateLevelResult;
}

// Prices a quote's road transport from the trucking tariffs: replaces its trucking lines (other
// lines stay), records the pricing and voids an earlier margin approval.
export const salesQuoteRoadPrice = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/road-price" },
  async (req: SalesQuoteRoadPriceRequest): Promise<SalesQuoteRoadPriceResponse> => {
    const { quoteNumber, ...request } = req;
    return salesQuoteService.roadPrice(getAuthData()!, quoteNumber, request);
  },
);
