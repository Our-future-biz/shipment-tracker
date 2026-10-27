import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { customerAddressService } from "../services/customerAddress.service";

interface AddressDeleteRequest {
  id: string;
}

interface AddressDeleteResponse {
  ok: boolean;
}

// Hides the address (soft delete: the row stays in the database and can be restored). Superadmins only.
export const addressDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customer-addresses/:id" },
  async (req: AddressDeleteRequest): Promise<AddressDeleteResponse> => {
    const actor = requireRole("superadmin");
    await customerAddressService.softDelete(req.id, actor.companyID);
    return { ok: true };
  },
);
