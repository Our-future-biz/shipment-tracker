import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface LogoFetchRequest {
  id: string;
}

interface LogoFetchResponse {
  customer: CustomerItem;
}

export const logoFetch = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:id/logo/fetch" },
  async (req: LogoFetchRequest): Promise<LogoFetchResponse> => {
    const customer = await customerService.fetchLogo(req.id, getAuthData()!.companyID);
    return { customer: customer as unknown as CustomerItem };
  },
);
