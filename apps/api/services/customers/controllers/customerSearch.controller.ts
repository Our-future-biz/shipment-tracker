import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { mainSearchInput } from "../../../lib/mainSearch";
import { customerService } from "../services/customer.service";
import type { SearchCustomersRequest, SearchCustomersResponse } from "../interfaces/interfaces";

/**
 * The main search (the top bar) in the Customer Database: the newest live companies (customers
 * and suppliers, every status) whose name, IČO, DIČ or city - or one of whose live contacts' name,
 * e-mail or phone - hold every word typed, and how many match in all. Fewer than 2 characters
 * give nothing.
 */
export const searchCustomers = api(
  { expose: true, auth: true, method: "GET", path: "/search/customers" },
  async (req: SearchCustomersRequest): Promise<SearchCustomersResponse> => {
    const input = mainSearchInput(req.q, req.limit);
    if (!input) return { items: [], total: 0 };
    return customerService.searchMain(getAuthData()!.companyID, input.q, input.limit);
  },
);
