import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";

interface SalesQuoteDataRequest {
  /** The quote's reference as a shipment's Sales Number holds it, with or without its Freight Mode letters. */
  quoteNumber: string;
}

interface SalesQuoteDataResponse {
  /** The live sales quote's document (its fields, as salesQuoteGet's `data`); null when there is no live sales quote under it. */
  quote: { data: unknown } | null;
}

// Internal only (the shipments service's Booked Dimensions, review of system-23): the document of a live sales
// quote of the caller's company. The shipments service names the shipment's own company (asCompany), whoever is
// signed in - read with a user's login of another company, that company's quote of the same reference was booked
// into the shipment. Company from the caller's auth.
export const _internalSalesQuoteData = api(
  { expose: false, auth: true, method: "POST", path: "/internal/sales-quotes/data" },
  async ({ quoteNumber }: SalesQuoteDataRequest): Promise<SalesQuoteDataResponse> => {
    const quote = await salesQuoteRepository.loadSales(getAuthData()!.companyID, quoteNumber.trim());
    return { quote: quote ? { data: quote.data } : null };
  },
);
