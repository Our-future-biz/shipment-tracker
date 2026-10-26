import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface CustomerRestoreRequest {
  id: string;
}

interface CustomerRestoreResponse {
  customer: CustomerItem;
}

// Brings a deleted customer back for everyone, with the contacts, addresses, notes, documents,
// invoices and sites deleted together with it. Superadmins only.
export const customerRestore = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:id/restore" },
  async (req: CustomerRestoreRequest): Promise<CustomerRestoreResponse> => {
    const actor = requireRole("superadmin");
    return { customer: await customerService.restore(req.id, actor.companyID) };
  },
);
