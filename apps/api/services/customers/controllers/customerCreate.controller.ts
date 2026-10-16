import { api } from "encore.dev/api";
import type { MatchesRegexp } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem, CustomerRole } from "../interfaces/interfaces";
import type { CustomerContactRequest } from "../interfaces/requests";

interface CustomerCreateRequest {
  /** IČO: exactly 8 digits */
  ico: string & MatchesRegexp<"^\\d{8}$">;
  /** ["customer"] when left out. */
  roles?: CustomerRole[];
  /** The contact person, created as the customer's main contact. */
  contact: CustomerContactRequest;
}

interface CustomerCreateResponse {
  customer: CustomerItem;
}

export const customerCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers" },
  async (req: CustomerCreateRequest): Promise<CustomerCreateResponse> => {
    return { customer: await customerService.createFromAres(getAuthData()!.companyID, req.ico, req.contact, req.roles) };
  },
);
