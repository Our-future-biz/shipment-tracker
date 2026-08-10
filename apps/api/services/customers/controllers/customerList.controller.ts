import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface CustomerListRequest {
  // Server-side filtering.
  search?: string;
  status?: string;
  label?: string;
  country?: string;
}

interface CustomerListResponse {
  data: CustomerItem[];
}

export const customerList = api(
  { expose: true, auth: true, method: "GET", path: "/customers" },
  async (req: CustomerListRequest): Promise<CustomerListResponse> => {
    const data = await customerService.list(getAuthData()!.companyID, {
      search: req.search,
      status: req.status,
      label: req.label,
      country: req.country,
    });
    return { data: data as unknown as CustomerItem[] };
  },
);
