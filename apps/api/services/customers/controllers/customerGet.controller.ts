import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import { isSupplier, type CustomerItem } from "../interfaces/interfaces";
import { canRateSupplier } from "../../../lib/salesPolicy";

interface CustomerGetRequest {
  id: string;
}

interface CustomerGetResponse {
  customer: CustomerItem;
  /** Whether the signed-in user may set this company's supplier rating: a manager, and the company is a supplier. */
  canRateSupplier: boolean;
}

export const customerGet = api(
  { expose: true, auth: true, method: "GET", path: "/customers/:id" },
  async (req: CustomerGetRequest): Promise<CustomerGetResponse> => {
    const actor = getAuthData()!;
    const customer = await customerService.get(req.id, actor.companyID);
    return { customer, canRateSupplier: canRateSupplier(actor.role) && isSupplier(customer.roles) };
  },
);
