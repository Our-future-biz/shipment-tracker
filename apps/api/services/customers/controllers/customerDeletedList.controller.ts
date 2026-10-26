import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { customerService } from "../services/customer.service";
import type { DeletedCustomerItem } from "../interfaces/interfaces";

interface CustomerDeletedListResponse {
  /** The most recently deleted first, at most 1000. */
  data: DeletedCustomerItem[];
}

// The deleted (hidden) customers of the company, for the Deleted view of the Customer
// Database. Superadmins only: they are the ones who delete and restore customers.
export const customerDeletedList = api(
  { expose: true, auth: true, method: "GET", path: "/deleted-customers" },
  async (): Promise<CustomerDeletedListResponse> => {
    const actor = requireRole("superadmin");
    return { data: await customerService.listDeleted(actor.companyID) };
  },
);
