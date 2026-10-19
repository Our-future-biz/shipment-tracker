import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem, CustomerLabel, CustomerRole, CustomerStatus } from "../interfaces/interfaces";

interface CustomerListRequest {
  // Server-side filtering.
  search?: string;
  status?: CustomerStatus;
  label?: CustomerLabel;
  country?: string;
  /** Only companies with this role, e.g. ?role=haulier */
  role?: CustomerRole;
}

interface CustomerListResponse {
  /** The newest matching customers, at most 2000. */
  data: CustomerItem[];
  /** How many customers match in all (more than `data` holds when it is cut). */
  total: number;
}

export const customerList = api(
  { expose: true, auth: true, method: "GET", path: "/customers" },
  async (req: CustomerListRequest): Promise<CustomerListResponse> => {
    return customerService.list(getAuthData()!.companyID, req);
  },
);
