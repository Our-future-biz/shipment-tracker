import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import { termsService } from "../services/terms.service";
import type { TermsConditionItem } from "../interfaces/interfaces";

interface TermsCreateRequest {
  name: string & MinLen<1> & MaxLen<200>;
}

interface TermsCreateResponse {
  terms: TermsConditionItem;
}

// Terms templates are company-wide settings: managers and up.
export const termsCreate = api(
  { expose: true, auth: true, method: "POST", path: "/terms-conditions" },
  async (req: TermsCreateRequest): Promise<TermsCreateResponse> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { terms: await termsService.create(actor.companyID, req.name) };
  },
);
