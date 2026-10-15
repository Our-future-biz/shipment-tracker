import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerSiteService } from "../services/customerSite.service";

interface CustomerSiteDeleteRequest {
  id: string;
}

interface CustomerSiteDeleteResponse {
  ok: boolean;
}

export const customerSiteDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customer-sites/:id" },
  async (req: CustomerSiteDeleteRequest): Promise<CustomerSiteDeleteResponse> => {
    await customerSiteService.softDelete(req.id, getAuthData()!.companyID);
    return { ok: true };
  },
);
