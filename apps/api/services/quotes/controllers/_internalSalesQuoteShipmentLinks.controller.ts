import { api, Query } from "encore.dev/api";
import { systemActor } from "../utils/systemActor.utils";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";

interface SalesQuoteShipmentLinksRequest {
  /** The company, for a call without a login (the hourly reconcile); ignored when there is one. */
  companyId?: Query<string>;
}

interface SalesQuoteShipmentLinksResponse {
  /** Every live sales quote of the company that is linked to a shipment, with that shipment. */
  links: { quoteNumber: string; shipmentId: string }[];
}

/**
 * Internal API of the shipments service: the shipment each quote of the caller's company is
 * linked to. The shipments service compares it with the shipments that name a quote and syncs
 * the differences, so a link that a failed call left wrong does not stay wrong.
 */
export const _internalSalesQuoteShipmentLinks = api(
  { expose: false, auth: false, method: "GET", path: "/internal/sales-quotes/shipment-links" },
  async (req: SalesQuoteShipmentLinksRequest): Promise<SalesQuoteShipmentLinksResponse> => {
    const companyId = getAuthData()?.companyID ?? systemActor(req.companyId).companyID;
    const links = await salesQuoteService.shipmentLinks(companyId);
    return { links };
  },
);
