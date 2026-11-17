import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mainSearchInput } from "../../../lib/mainSearch";
import { shipmentService } from "../services/shipment.service";
import type { SearchContainersRequest, SearchContainersResponse } from "../interfaces/interfaces";

/**
 * The main search (the top bar) in containers: the containers of the company's live shipments
 * whose number holds what was typed - spaces left out, in any case, from 4 characters - each with
 * its job and master job, the newest jobs first, and how many match in all.
 */
export const searchContainers = api(
  { expose: true, auth: true, method: "GET", path: "/search/containers" },
  async (req: SearchContainersRequest): Promise<SearchContainersResponse> => {
    const input = mainSearchInput(req.q, req.limit);
    if (!input) return { items: [], total: 0 };
    return shipmentService.searchContainers(getAuthData()!.companyID, input.q, input.limit);
  },
);
