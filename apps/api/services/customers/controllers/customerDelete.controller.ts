import { api, APIError } from "encore.dev/api";
import { customerService } from "../services/customer.service";

interface CustomerDeleteRequest {
  id: string;
}

interface CustomerDeleteResponse {
  ok: boolean;
}

export const customerDelete = api(
  { expose: true, auth: false, method: "DELETE", path: "/customers/:id" },
  async (req: CustomerDeleteRequest): Promise<CustomerDeleteResponse> => {
    const customer = await customerService.getById(req.id);
    if (!customer) {
      throw APIError.notFound("Customer not found");
    }
    await customerService.softDelete(req.id);
    return { ok: true };
  },
);
