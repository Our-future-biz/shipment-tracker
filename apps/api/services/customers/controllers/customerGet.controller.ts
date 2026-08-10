import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface CustomerGetRequest {
  id: string;
}

interface CustomerGetResponse {
  customer: CustomerItem;
}

export const customerGet = api(
  { expose: true, auth: true, method: "GET", path: "/customers/:id" },
  async (req: CustomerGetRequest): Promise<CustomerGetResponse> => {
    const customer = await customerService.getById(req.id, getAuthData()!.companyID);
    if (!customer) {
      throw APIError.notFound("Customer not found");
    }
    return { customer: customer as unknown as CustomerItem };
  },
);
