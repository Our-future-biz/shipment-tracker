import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { isUuid } from "../../../lib/uuid";
import { customerService } from "../services/customer.service";

interface CustomerActivateRequest {
  id: string;
  /**
   * The company, for a call that carries no login (the hourly quote reconcile of the shipments
   * service runs as the system). Under a login the caller's company is used and this is ignored.
   */
  companyId?: string;
}

interface CustomerActivateResponse {
  /** False when the customer was already Active, or no longer exists: nothing was written. */
  changed: boolean;
}

// Internal only (not exposed to clients): the quotes service calls it when a quote of the customer is won,
// so a customer who has bought something is Active. auth:false so the reconcile (no login) reaches it too;
// the company is the caller's when there is a login, otherwise the one the internal call names.
export const customerActivate = api(
  { expose: false, auth: false, method: "POST", path: "/internal/customers/:id/activate" },
  async ({ id, companyId }: CustomerActivateRequest): Promise<CustomerActivateResponse> => {
    const company = getAuthData()?.companyID ?? companyId;
    if (!company || !isUuid(company)) throw APIError.invalidArgument("an internal call without a login must name its company");
    return { changed: await customerService.activate(id, company) };
  },
);
