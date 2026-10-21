import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { QuoteShipments } from "../interfaces/interfaces";

interface ShipmentsNamingQuotesRequest {
  /** Quote references, at most 200: the quotes on one page of the Quotes list. */
  references: string[];
}

interface ShipmentsNamingQuotesResponse {
  /** Every reference asked for, with the live shipments that name it - the oldest first. */
  quotes: QuoteShipments[];
}

/**
 * How many shipments each quote has, and which: the live shipments of the caller's company whose
 * Sales Number is the quote's reference. Read from the shipments themselves - a quote keeps only
 * the oldest. The Quotes list asks it for the page it shows.
 */
export const shipmentsNamingQuotes = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/naming-quotes" },
  async (req: ShipmentsNamingQuotesRequest): Promise<ShipmentsNamingQuotesResponse> => {
    return { quotes: await shipmentService.shipmentsNamingQuotes(getAuthData()!.companyID, req.references ?? []) };
  },
);
