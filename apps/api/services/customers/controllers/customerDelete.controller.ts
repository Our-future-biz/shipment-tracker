import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { customerService } from "../services/customer.service";

interface CustomerDeleteRequest {
  id: string;
}

interface CustomerDeleteResponse {
  ok: boolean;
}

// Removes the customer with its contacts, notes, documents and invoices: managers and up only.
export const customerDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customers/:id" },
  async (req: CustomerDeleteRequest): Promise<CustomerDeleteResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    await customerService.softDelete(req.id, actor.companyID);
    return { ok: true };
  },
);
