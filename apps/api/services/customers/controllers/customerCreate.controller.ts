import { api } from "encore.dev/api";
import type { MatchesRegexp } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface CustomerCreateRequest {
  /** IČO: exactly 8 digits */
  ico: string & MatchesRegexp<"^\\d{8}$">;
}

interface CustomerCreateResponse {
  customer: CustomerItem;
}

export const customerCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers" },
  async (req: CustomerCreateRequest): Promise<CustomerCreateResponse> => {
    return { customer: await customerService.createFromAres(getAuthData()!.companyID, req.ico) };
  },
);
