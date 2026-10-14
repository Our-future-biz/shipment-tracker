import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem, CustomerLabel, CustomerStatus } from "../interfaces/interfaces";

interface CustomerListRequest {
  // Server-side filtering.
  search?: string;
  status?: CustomerStatus;
  label?: CustomerLabel;
  country?: string;
}

interface CustomerListResponse {
  data: CustomerItem[];
}

export const customerList = api(
  { expose: true, auth: true, method: "GET", path: "/customers" },
  async (req: CustomerListRequest): Promise<CustomerListResponse> => {
    return { data: await customerService.list(getAuthData()!.companyID, req) };
  },
);
