import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";

interface QuotesByTariffVersionsRequest {
  /** Trucking tariff version ids (one tariff's versions) */
  versionIds: string[];
}

interface QuotesByTariffVersionsResponse {
  /** Open quotes (not won or lost) road-priced with one of the versions, sell or buy */
  count: number;
}

/**
 * Internal API for Trucking: how many of the caller's company's open quotes were road-priced with
 * a version of a tariff, so the tariff diff can say how many quotes a change touches.
 */
export const _internalQuotesByTariffVersions = api(
  { expose: false, auth: true, method: "POST", path: "/internal/sales-quotes/by-tariff-versions" },
  async ({ versionIds }: QuotesByTariffVersionsRequest): Promise<QuotesByTariffVersionsResponse> => {
    return { count: await salesQuoteService.countByTariffVersions(getAuthData()!.companyID, Array.isArray(versionIds) ? versionIds : []) };
  },
);
