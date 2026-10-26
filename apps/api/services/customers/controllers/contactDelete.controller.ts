import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { contactService } from "../services/contact.service";

interface ContactDeleteRequest {
  id: string;
}

interface ContactDeleteResponse {
  ok: boolean;
}

// Hides the contact (soft delete: the row stays in the database and can be restored). Superadmins only.
export const contactDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customer-contacts/:id" },
  async (req: ContactDeleteRequest): Promise<ContactDeleteResponse> => {
    const actor = requireRole("superadmin");
    await contactService.softDelete(req.id, actor.companyID);
    return { ok: true };
  },
);
