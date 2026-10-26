import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerRefsService } from "../services/customerRefs.service";
import type { CustomerContactRef, CustomerRef } from "../interfaces/interfaces";

interface CustomerRefsRequest {
  /** Customers of the caller's company; deleted ones are left out. */
  customerIds: string[] & MaxLen<2000>;
}

interface CustomerRefsResponse {
  customers: CustomerRef[];
  /** The live contacts of those customers. */
  contacts: CustomerContactRef[];
}

/**
 * Internal: the current names of customers and their contacts by id, for other services that keep
 * copies of them next to the id (shipments, quotes, …): to link old copies and to bring them up to
 * date (see topics.ts for the change events that keep them current afterwards).
 */
export const _internalCustomerRefs = api(
  { expose: false, auth: true, method: "POST", path: "/internal/customers/refs" },
  async ({ customerIds }: CustomerRefsRequest): Promise<CustomerRefsResponse> => {
    return customerRefsService.refs(getAuthData()!.companyID, customerIds);
  },
);
