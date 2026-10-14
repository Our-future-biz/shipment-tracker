import { api } from "encore.dev/api";
import type { MaxLen, Min, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem, CustomerLabel, CustomerStatus, RiskLevelOverride } from "../interfaces/interfaces";

// The rollups (totalRevenue, totalProfit, totalShipments, lastActivityDate) are not here:
// they are computed from shipments and written only through customerRollupsUpdate.
interface CustomerUpdateRequest {
  id: string;
  companyName?: string & MinLen<1> & MaxLen<300>;
  dic?: string & MaxLen<20>;
  status?: CustomerStatus;
  /** A user of the company, or null for no owner. The owner's name is looked up from the user. */
  salesOwnerUserId?: string | null;
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
  /** yyyy-mm-dd, or "" to clear: the company age and stability follow it. */
  registrationDate?: string & MaxLen<10>;
  /** Company analysis set by hand; "" goes back to the value derived from the registry data. */
  industry?: string & MaxLen<200>;
  typicalCargo?: string & MaxLen<200>;
  stability?: string & MaxLen<100>;
  riskLevel?: RiskLevelOverride;
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
