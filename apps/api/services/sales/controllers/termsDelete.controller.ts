import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { termsService } from "../services/terms.service";

interface TermsDeleteRequest {
  id: string;
}

interface TermsDeleteResponse {
  ok: boolean;
}

// Terms templates are company-wide settings: managers and up.
export const termsDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/terms-conditions/:id" },
  async (req: TermsDeleteRequest): Promise<TermsDeleteResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    await termsService.softDelete(req.id, actor.companyID);
    return { ok: true };
  },
);
