import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface CustomerListResponse {
  data: CustomerItem[];
}

export const customerList = api(
  { expose: true, auth: true, method: "GET", path: "/customers" },
  async (): Promise<CustomerListResponse> => {
    const data = await customerService.list(getAuthData()!.companyID);
    return { data: data as unknown as CustomerItem[] };
  },
);
