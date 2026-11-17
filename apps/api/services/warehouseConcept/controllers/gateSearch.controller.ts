import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { mainSearchInput } from "../../../lib/mainSearch";
import { searchGateRecords } from "../services/gateSearch.service";
import type { SearchGateRecordsRequest, SearchGateRecordsResponse } from "../interfaces/records.interfaces";

/**
 * The main search (the top bar) in the Warehouse Concept: its gate records by their warehouse
 * reference (WCZ…), also typed with other letters or none, the newest first, and how many match in
 * all. Superadmins only, as the Warehouse Concept's pages are.
 */
export const searchWarehouseConcept = api(
  { expose: true, auth: true, method: "GET", path: "/search/warehouse-concept" },
  async (req: SearchGateRecordsRequest): Promise<SearchGateRecordsResponse> => {
    const { companyID } = requireRole("superadmin");
    const input = mainSearchInput(req.q, req.limit);
    if (!input) return { items: [], total: 0 };
    return searchGateRecords(companyID, input.q, input.limit);
  },
);
