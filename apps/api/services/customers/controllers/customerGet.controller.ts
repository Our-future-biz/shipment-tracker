import { api, APIError } from "encore.dev/api";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface CustomerGetRequest {
  id: string;
}

interface CustomerGetResponse {
  customer: CustomerItem;
}

export const customerGet = api(
  { expose: true, auth: false, method: "GET", path: "/customers/:id" },
  async (req: CustomerGetRequest): Promise<CustomerGetResponse> => {
    const customer = await customerService.getById(req.id);
    if (!customer) {
      throw APIError.notFound("Customer not found");
    }
    return { customer: customer as unknown as CustomerItem };
  },
);
