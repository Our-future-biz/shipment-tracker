import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface CustomerCreateRequest {
  ico: string;
}

interface CustomerCreateResponse {
  customer: CustomerItem;
}

export const customerCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers" },
  async (req: CustomerCreateRequest): Promise<CustomerCreateResponse> => {
    if (!req.ico) {
      throw APIError.invalidArgument("ico is required");
    }
    const customer = await customerService.createFromAres(getAuthData()!.companyID, req.ico);
    return { customer: customer as unknown as CustomerItem };
  },
);
