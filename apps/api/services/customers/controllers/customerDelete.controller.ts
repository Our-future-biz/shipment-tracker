import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { customerService } from "../services/customer.service";

interface CustomerDeleteRequest {
  id: string;
}

interface CustomerDeleteResponse {
  ok: boolean;
}

// Hides the customer with its contacts, addresses, notes, documents and invoices (soft delete:
// the rows stay in the database and can be restored). Superadmins only.
export const customerDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customers/:id" },
  async (req: CustomerDeleteRequest): Promise<CustomerDeleteResponse> => {
    const actor = requireRole("superadmin");
    await customerService.softDelete(req.id, actor.companyID);
    return { ok: true };
  },
);
