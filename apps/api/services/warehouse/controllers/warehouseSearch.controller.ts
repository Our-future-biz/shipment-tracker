import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mainSearchInput } from "../../../lib/mainSearch";
import { searchWarehouseMain } from "../services/warehouseSearch.service";
import type { SearchWarehouseRequest, SearchWarehouseResponse } from "../interfaces/interfaces";

/**
 * The main search (the top bar) in the warehouse: the company's shipments' warehouse records whose
 * reference (WHCZ…) holds what was typed - spaces left out, in any case, from 4 characters - or is
 * that number with other letters or none, the newest first, each with its job and the Warehouse
 * page it is on, and how many match in all. Every signed-in role, as for the Warehouse pages.
 */
export const searchWarehouse = api(
  { expose: true, auth: true, method: "GET", path: "/search/warehouse" },
  async (req: SearchWarehouseRequest): Promise<SearchWarehouseResponse> => {
    const input = mainSearchInput(req.q, req.limit);
    if (!input) return { items: [], total: 0 };
    return searchWarehouseMain(getAuthData()!.companyID, input.q, input.limit);
  },
);
