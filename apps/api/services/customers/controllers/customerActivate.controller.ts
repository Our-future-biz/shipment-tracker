import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";

interface CustomerActivateRequest {
  id: string;
}

interface CustomerActivateResponse {
  /** False when the customer was already Active, or no longer exists: nothing was written. */
  changed: boolean;
}

// Internal only (not exposed to clients): the quotes service calls it when a quote of the customer is won,
// so a customer who has bought something is Active. The company comes from the caller's auth.
export const customerActivate = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/:id/activate" },
  async ({ id }: CustomerActivateRequest): Promise<CustomerActivateResponse> => {
    return { changed: await customerService.activate(id, getAuthData()!.companyID) };
  },
);
