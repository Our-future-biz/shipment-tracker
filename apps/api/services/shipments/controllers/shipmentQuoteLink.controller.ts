import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";
import type { QuoteSyncResult } from "../interfaces/interfaces";

interface ShipmentQuoteLinkRequest {
  shipmentId: string;
  /** The shipment was created from the quote: an open quote becomes Won, as it would have at the create. */
  markWon?: boolean;
}

/**
 * Tells the sales quote in the shipment's Sales Number about the shipment (again): the quote
 * links itself to the oldest live shipment that names it. The retry for a create whose answer
 * said the quote could not be told - then with markWon - and for a shipment whose quote does not
 * know it yet. What goes wrong is answered as an error, not swallowed. `found: false` in the
 * answer: the Sales Number names no live sales quote.
 */
export const shipmentQuoteLink = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/quote-link" },
  async (req: ShipmentQuoteLinkRequest): Promise<QuoteSyncResult> => {
    return shipmentService.linkQuote(req.shipmentId, getAuthData()!.companyID, req.markWon === true);
  },
);
