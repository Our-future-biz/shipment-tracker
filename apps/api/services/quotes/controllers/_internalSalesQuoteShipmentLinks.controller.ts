import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";

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
  { expose: false, auth: true, method: "GET", path: "/internal/sales-quotes/shipment-links" },
  async (): Promise<SalesQuoteShipmentLinksResponse> => {
    const links = await salesQuoteService.shipmentLinks(getAuthData()!.companyID);
    return { links };
  },
);
