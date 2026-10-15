import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerSiteService } from "../services/customerSite.service";
import type { CustomerSiteItem } from "../interfaces/interfaces";

interface CustomerSiteListRequest {
  customerId: string;
}

interface CustomerSiteListResponse {
  data: CustomerSiteItem[];
}

export const customerSiteList = api(
  { expose: true, auth: true, method: "GET", path: "/customers/:customerId/sites" },
  async (req: CustomerSiteListRequest): Promise<CustomerSiteListResponse> => {
    return { data: await customerSiteService.listByCustomer(req.customerId, getAuthData()!.companyID) };
  },
);
