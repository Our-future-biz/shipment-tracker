import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";

interface ShipmentsNamingQuoteRequest {
  /** A sales quote reference. */
  reference: string & MinLen<1> & MaxLen<50>;
}

interface ShipmentsNamingQuoteResponse {
  /** The live shipments of the caller's company whose Sales Number is the reference, the oldest first. */
  shipments: { id: string; jobNumber: string }[];
}

/**
 * Internal API of the quotes service: which live shipments still name a quote, read from the
 * shipments themselves - not from the quote's own link, which a failed call can leave empty. A
 * quote named by a shipment must not be deleted.
 */
export const _internalShipmentsNamingQuote = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/naming-quote" },
  async (req: ShipmentsNamingQuoteRequest): Promise<ShipmentsNamingQuoteResponse> => {
    return { shipments: await shipmentService.shipmentsNamingQuote(getAuthData()!.companyID, req.reference) };
  },
);
