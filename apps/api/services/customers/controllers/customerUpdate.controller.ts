import { api } from "encore.dev/api";
import type { MaxLen, Min, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem, CustomerLabel, CustomerRole, CustomerStatus, RiskLevelOverride } from "../interfaces/interfaces";

// The rollups (totalRevenue, totalProfit, totalShipments, lastActivityDate) are not here:
// they are computed from shipments and written only through customerRollupsUpdate.
// Nor is the registered address: it lives in the customer's Registered address (the
// addresses endpoints), and the copy on the customer follows it (lib/seat.ts).
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
  nace?: string & MaxLen<500>;
  /** The whole set, replacing the current one; at least one role. */
  roles?: CustomerRole[];
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
    const actor = getAuthData()!;
    return { customer: await customerService.update(id, actor.companyID, actor.role, patch) };
  },
);
