import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";

interface CustomerDeleteRequest {
  id: string;
}

interface CustomerDeleteResponse {
  ok: boolean;
}

export const customerDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customers/:id" },
  async (req: CustomerDeleteRequest): Promise<CustomerDeleteResponse> => {
    const companyId = getAuthData()!.companyID;
    const deleted = await customerService.softDelete(req.id, companyId);
    if (!deleted) {
      throw APIError.notFound("Customer not found");
    }
    return { ok: true };
  },
);
