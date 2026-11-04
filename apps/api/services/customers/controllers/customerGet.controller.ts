import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerDetail } from "../interfaces/interfaces";

interface CustomerGetRequest {
  id: string;
}

// The response keeps its name: the web app reads it as CustomerGetResponse.
interface CustomerGetResponse extends CustomerDetail {}

export const customerGet = api(
  { expose: true, auth: true, method: "GET", path: "/customers/:id" },
  async (req: CustomerGetRequest): Promise<CustomerGetResponse> => {
    const actor = getAuthData()!;
    return customerService.detail(req.id, actor.companyID, actor.role);
  },
);
