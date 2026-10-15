import { api } from "encore.dev/api";
import type { MaxLen, Min, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem, CustomerLabel, CustomerRole, CustomerStatus } from "../interfaces/interfaces";

// The rollups (totalRevenue, totalProfit, totalShipments, lastActivityDate) are not here:
// they are computed from shipments and written only through customerRollupsUpdate.
interface CustomerUpdateRequest {
  id: string;
  companyName?: string & MinLen<1> & MaxLen<300>;
  dic?: string & MaxLen<20>;
  status?: CustomerStatus;
  salesOwner?: string & MaxLen<200>;
  label?: CustomerLabel;
  creditLimit?: number & Min<0>;
  currency?: string & MaxLen<3>;
  paymentTerms?: string & MaxLen<100>;
  freightPaymentTerms?: string & MaxLen<100>;
  dutyPaymentTerms?: string & MaxLen<100>;
  companyWebsite?: string & MaxLen<300>;
  city?: string & MaxLen<200>;
  country?: string & MaxLen<100>;
  registeredAddress?: string & MaxLen<500>;
  nace?: string & MaxLen<500>;
  /** The whole set, replacing the current one; at least one role. */
  roles?: CustomerRole[];
}

interface CustomerUpdateResponse {
  customer: CustomerItem;
}

export const customerUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/customers/:id" },
  async ({ id, ...patch }: CustomerUpdateRequest): Promise<CustomerUpdateResponse> => {
    return { customer: await customerService.update(id, getAuthData()!.companyID, patch) };
  },
);
