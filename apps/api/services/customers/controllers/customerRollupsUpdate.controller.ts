import { api } from "encore.dev/api";
import type { Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";

interface CustomerRollupsUpdateRequest {
  id: string;
  totalRevenue: number;
  totalProfit: number;
  totalShipments: number & Min<0>;
  /** yyyy-mm-dd, or "" when the customer has no shipments */
  lastActivityDate: string;
}

interface CustomerRollupsUpdateResponse {
  ok: boolean;
}

// Internal only (not exposed to clients): the shipments service recomputes a customer's
// totals from its shipments and stores them here. The company comes from the caller's auth.
export const customerRollupsUpdate = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/:id/rollups" },
  async ({ id, ...rollups }: CustomerRollupsUpdateRequest): Promise<CustomerRollupsUpdateResponse> => {
    await customerService.updateRollups(id, getAuthData()!.companyID, rollups);
    return { ok: true };
  },
);
