import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { salesQuoteService } from "../services/salesQuote.service";
import type { QuoteShipmentsItem, QuoteShipmentsResult } from "../interfaces/interfaces";

interface SalesQuoteShipmentSyncRequest {
  /** At most 200 quotes; each with every live shipment that names it. */
  items: QuoteShipmentsItem[];
  /** A repair nobody asked for (the reconcile): the history lines say "System" instead of a user. */
  automatic?: boolean;
}

interface SalesQuoteShipmentSyncResponse {
  /** One result per item, in the order of the items. */
  results: QuoteShipmentsResult[];
}

/**
 * Internal API of the shipments service: brings quotes in step with the shipments that name
 * them. Shipments live in another database, so the shipments service says, for a quote
 * reference, which live shipments carry it in their Sales Number - always all of them, oldest
 * first - and the quote takes its link, its history lines and, for a shipment created from it,
 * the status Won from that. The same list sent again changes nothing. The company and the
 * acting user come from the login of the request the shipments service is serving.
 */
export const _internalSalesQuoteShipmentSync = api(
  { expose: false, auth: true, method: "POST", path: "/internal/sales-quotes/shipment-sync" },
  async (req: SalesQuoteShipmentSyncRequest): Promise<SalesQuoteShipmentSyncResponse> => {
    const results = await salesQuoteService.syncShipments(getAuthData()!, req.items, req.automatic);
    return { results };
  },
);
