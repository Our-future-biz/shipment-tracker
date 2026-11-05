import { api } from "encore.dev/api";
import type { MatchesRegexp, MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerService, supplierRequestOf } from "../services/customer.service";
import type { CustomerItem, CustomerRole } from "../interfaces/interfaces";
import type { CustomerContactRequest } from "../interfaces/requests";

interface CustomerCreateRequest {
  /** IČO: exactly 8 digits */
  ico: string & MatchesRegexp<"^\\d{8}$">;
  /** ["customer"] when left out. */
  roles?: CustomerRole[];
  /**
   * A supplier added from this quote's Pricing (its Sales Reference). Any user may add one so: unless the
   * user is a manager, it waits for a manager's approval on Sales → Managers → Company approval.
   */
  fromQuote?: string & MaxLen<40>;
  /** The contact person, created as the customer's main contact. */
  contact: CustomerContactRequest;
}

interface CustomerCreateResponse {
  customer: CustomerItem;
}

export const customerCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers" },
  async (req: CustomerCreateRequest): Promise<CustomerCreateResponse> => {
    const { companyID, role, userID } = getAuthData()!;
    return { customer: await customerService.createFromAres(companyID, role, req.ico, req.contact, req.roles, supplierRequestOf(userID, req.fromQuote)) };
  },
);
