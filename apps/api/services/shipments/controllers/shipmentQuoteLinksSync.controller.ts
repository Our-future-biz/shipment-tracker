import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { canManageSales } from "../../../lib/salesPolicy";
import { quoteLinksService } from "../services/quoteLinks.service";
import type { QuoteLinksSyncResult } from "../interfaces/interfaces";

interface ShipmentQuoteLinksSyncRequest {
  /** Managers only: compare everything now, whenever the last run was, and go on until nothing is left. */
  force?: boolean;
}

interface ShipmentQuoteLinksSyncResponse extends QuoteLinksSyncResult {
  /** False when no run was due: the links were compared within the last hour and nothing has failed since. */
  ran: boolean;
}

/**
 * Compares the company's shipments with the links its sales quotes hold and repairs what
 * differs: a quote learns of a shipment that carries its number, and forgets one that no longer
 * does. The same run the list of shipments starts by itself, for a screen that shows links
 * before anybody opened Shipments (Quote History), and - forced - for a manager after a deploy.
 */
export const shipmentQuoteLinksSync = api(
  { expose: true, auth: true, method: "POST", path: "/shipment-quote-links/sync" },
  async (req: ShipmentQuoteLinksSyncRequest): Promise<ShipmentQuoteLinksSyncResponse> => {
    const auth = getAuthData()!;
    if (req.force && !canManageSales(auth.role)) {
      throw APIError.permissionDenied("only a manager can force the sync of quote links");
    }
    return quoteLinksService.sync(auth.companyID, req.force === true);
  },
);
