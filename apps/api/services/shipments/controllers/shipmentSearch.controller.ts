import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mainSearchInput } from "../../../lib/mainSearch";
import { shipmentService } from "../services/shipment.service";
import type { SearchShipmentsRequest, SearchShipmentsResponse } from "../interfaces/interfaces";

/**
 * The main search (the top bar) in Shipments: the newest live shipments of the company that the
 * Shipments list's search finds by these words, and how many match in all. Fewer than 2
 * characters give nothing.
 */
export const searchShipments = api(
  { expose: true, auth: true, method: "GET", path: "/search/shipments" },
  async (req: SearchShipmentsRequest): Promise<SearchShipmentsResponse> => {
    const input = mainSearchInput(req.q, req.limit);
    if (!input) return { items: [], total: 0 };
    return shipmentService.searchMain(getAuthData()!.companyID, input.q, input.limit);
  },
);
